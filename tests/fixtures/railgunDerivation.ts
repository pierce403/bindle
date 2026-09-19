/**
 * Public, deliberately compromised BIP-39 test vector. NEVER fund this wallet.
 * Expected values were computed independently with @railgun-community/engine
 * 9.7.0, git 31bf5bb3dbceea284832f0a326a616bdfc8dd191, on 2026-09-19.
 * Both schemes were cross-checked against Kohaku alpha.22 and alpha.30 WASM.
 *
 * Reference: engine/src/key-derivation/{bip32,wallet-node,bech32}.ts and
 * engine/src/utils/keys-utils.ts. The canonical tree uses "babyjubjub seed"
 * and hardened HMAC chaining. Historical Bindle used ethers secp256k1 BIP32.
 * https://github.com/ethereum/kohaku/issues/243 documents this incompatibility.
 * No private derived keys, user records, or network wallet state are fixtures.
 */
export const publicTestMnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

export const railgunDerivationFixtures = [
  {
    keyIndex: 0,
    derivationVersion: "bindle-ethers-bip32-v1",
    railgunAddress: "0zk1qynk89wp2grzvc8ppgpm2ajh69l3yq8mjp2fy3dk9f9yfyfus0327unpd9kxwatwqxqmvzdnuv5eytel5mqejd95d8u8qtsr4nl6kzt0pzccwxgwc6dgx7fe7rf",
    spendingPublicKey: ["12562132641303952285113001531508662047911214415471689926394210580535014778861", "8527308083260209869739925651865422824658034031248087104370297714252041139383"],
    viewingPublicKey: "81b609b3e329922f3fa6c19934b469f8702e03acffab096f08b187190ec69a83",
    masterPublicKey: "17816152526273965594689259550863487336450189838521851427717897130197068800687",
    spendingKeySha256: "c22ea77d72ff407db82eab47545cb660c69a5d856e4059245599469eb2f5a563",
    viewingKeySha256: "270eaeca90477628d86f3dcf3d65b81f36c6bf9f6711c1682c9b91802a7eefe6"
  },
  {
    keyIndex: 0,
    derivationVersion: "railgun-babyjubjub-v1",
    railgunAddress: "0zk1qy4v02p5zkq0zfpaxhz79j5tslrv8c44d80d8jr2fuecrtxlp8le6unpd9kxwatwq80jm7u592n0hr8elesd0xzv6y9jpdvsyln80m95jcxhvnmagfqg5xhkkhn",
    spendingPublicKey: ["21725194683971601625357993914711234354000760307317172095138789827480990690892", "18185059732936663794890181151638097537207598791675324797050194801074344044960"],
    viewingPublicKey: "df2dfb942aa6fb8cf9fe60d7984cd10b20b59027e677ecb4960d764f7d42408a",
    masterPublicKey: "19349903103956176070235423774157995896840157182198600174309409106416294821789",
    spendingKeySha256: "efd12f19f3a50f28023faac68976a4e5104b4b4c69b13f512a76bb58f1816585",
    viewingKeySha256: "0197bf5799621f9b881769cab2fa92b79e8f54f23c4c50d5edb9659e68798c08"
  },
  {
    keyIndex: 1,
    derivationVersion: "bindle-ethers-bip32-v1",
    railgunAddress: "0zk1qy2re5hwxdntx9vr867yd6x4h650f5shryf07r38aze5m5urgh98wunpd9kxwatwqy68z3n6xs6cymrmrp8cn4rwdxq54d8lfdc8ll66x7zlthy99w0wql3u5p7",
    spendingPublicKey: ["17198455013271275602023905067459690852525372966589811304575434294146435306554", "5700573776930977020292647730100285079644368344295678849548241192202654443078"],
    viewingPublicKey: "3471467a3435826c7b184f89d46e69814ab4ff4b707fff5a3785f5dc852b9ee0",
    masterPublicKey: "9153723584165338645744399078038302943481683582096190162524849547426012711543",
    spendingKeySha256: "e9a8cbcebfbe6656c3321c4415a3bccefeaf9fba9e56eb9e6b4811d5d11c4208",
    viewingKeySha256: "0a2c89342fb6f204eed9cc1a0ea4d7d0d66a2e33ff9fc8eaaf059e62a3d00ea8"
  },
  {
    keyIndex: 1,
    derivationVersion: "railgun-babyjubjub-v1",
    railgunAddress: "0zk1qyshnlgrjhycpzkj7zum9tdx6xump9p40y6ky2gq4qwsuflj7c5j5unpd9kxwatwqy4vzeqppnnkaqfsv0w4rjlpgmvcc8zyjgmwx6gnamztknd94ah524v3eyh",
    spendingPublicKey: ["20075715720978107113382035817626829414712776518035244265792023991073936407127", "12646054749330015378662878700362961167214939976756372290683059513339422258778"],
    viewingPublicKey: "2ac164010ce76e813063dd51cbe146d98c1c449236e36913eec4bb4da5af6f45",
    masterPublicKey: "15141858736565977956391774645104144147533771408235322429954022255226068019498",
    spendingKeySha256: "ec3ef58fbd11475b41629a075f514bc92ddacbce3379417a9f608d65c2ee8696",
    viewingKeySha256: "536fd77b6669a1f7aa8c5de645be72dbf24d96e2eb9563e897356aff9f4cb97d"
  }
] as const;
