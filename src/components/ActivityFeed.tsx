import { ArrowDownLeft, ArrowUpRight, Inbox } from "lucide-react";

export type ActivityItem = {
  id: string;
  name: string;
  handle: string;
  amount: string;
  asset: "USDC" | "ETH" | "DAI";
  note: string;
  direction: "in" | "out";
  route: string;
  time: string;
};

type ActivityFeedProps = {
  items: ActivityItem[];
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="panel feed" aria-labelledby="activity-heading">
      <div className="section-heading">
        <h2 id="activity-heading">Activity</h2>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <Inbox size={22} aria-hidden="true" />
          <strong>No activity</strong>
          <span>Synced wallet events will appear here.</span>
        </div>
      ) : (
        <div className="activity-list">
          {items.map((item) => {
            const isIncoming = item.direction === "in";
            const Icon = isIncoming ? ArrowDownLeft : ArrowUpRight;

            return (
              <article className="activity-item" key={item.id}>
                <div className={`avatar ${isIncoming ? "incoming" : "outgoing"}`}>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div className="activity-copy">
                  <div className="activity-title">
                    <strong>{item.name}</strong>
                    <span>{item.time}</span>
                  </div>
                  <p>{item.note}</p>
                  <span>{item.route}</span>
                </div>
                <div
                  className={isIncoming ? "amount incoming" : "amount outgoing"}
                >
                  {isIncoming ? "+" : "-"}
                  {item.amount} {item.asset}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
