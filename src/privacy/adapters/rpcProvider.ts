import type { Eip1193Provider, RawLog } from "@kohaku-eth/railgun";

type RpcError = {
  code?: number;
  message?: string;
};

type RpcResponse<T> = {
  result?: T;
  error?: RpcError;
};

type RpcLog = {
  address?: `0x${string}`;
  blockNumber?: `0x${string}`;
  data?: `0x${string}`;
  topics?: `0x${string}`[];
  transactionHash?: `0x${string}`;
};

let nextRequestId = 1;

const hexToBigInt = (hex: `0x${string}`): bigint => BigInt(hex);

const numberToBlockHex = (block: number): `0x${string}` =>
  `0x${block.toString(16)}`;

const requestRpc = async <T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextRequestId++,
        method,
        params
      })
    });
  } catch (error) {
    throw new Error(
      `Ethereum RPC ${method} could not be reached from this browser. The configured endpoint may be offline, blocking CORS, rate-limiting browser requests, or rejecting this RPC method. Endpoint: ${rpcUrl}`,
      { cause: error }
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ethereum RPC ${method} failed with HTTP ${response.status}. Endpoint: ${rpcUrl}`
    );
  }

  const payload = (await response.json()) as RpcResponse<T>;

  if (payload.error) {
    throw new Error(
      payload.error.message ?? `Ethereum RPC ${method} failed`
    );
  }

  if (payload.result === undefined) {
    throw new Error(`Ethereum RPC ${method} returned no result`);
  }

  return payload.result;
};

export const createExplicitRpcProvider = (rpcUrl: string): Eip1193Provider => ({
  getChainId: async () => hexToBigInt(await requestRpc(rpcUrl, "eth_chainId", [])),
  getBlockNumber: async () =>
    hexToBigInt(await requestRpc(rpcUrl, "eth_blockNumber", [])),
  getLogs: async (address, eventSignature, fromBlock, toBlock) => {
    const filter: {
      address: `0x${string}`;
      fromBlock?: `0x${string}`;
      toBlock?: `0x${string}`;
      topics?: [`0x${string}`];
    } = { address };

    if (eventSignature) {
      filter.topics = [eventSignature];
    }

    if (fromBlock !== undefined) {
      filter.fromBlock = numberToBlockHex(fromBlock);
    }

    if (toBlock !== undefined) {
      filter.toBlock = numberToBlockHex(toBlock);
    }

    const logs = await requestRpc<RpcLog[]>(rpcUrl, "eth_getLogs", [filter]);

    return logs.map<RawLog>((log) => ({
      address: log.address ?? address,
      blockNumber:
        log.blockNumber !== undefined ? Number(BigInt(log.blockNumber)) : null,
      blockTimestamp: null,
      data: log.data ?? "0x",
      topics: log.topics ?? [],
      transactionHash: log.transactionHash ?? null
    }));
  },
  ethCall: async (to, data) =>
    requestRpc(rpcUrl, "eth_call", [{ to, data }, "latest"]),
  estimateGas: async (to, from, data) =>
    hexToBigInt(
      await requestRpc(rpcUrl, "eth_estimateGas", [
        {
          to,
          from,
          data
        }
      ])
    ),
  getGasPrice: async () =>
    hexToBigInt(await requestRpc(rpcUrl, "eth_gasPrice", [])),
  getTransactionCount: async (address, block) =>
    hexToBigInt(
      await requestRpc(rpcUrl, "eth_getTransactionCount", [
        address,
        block !== undefined ? numberToBlockHex(block) : "latest"
      ])
    )
});
