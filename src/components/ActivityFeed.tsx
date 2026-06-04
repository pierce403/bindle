import { ArrowDownLeft, ArrowUpRight, Inbox } from "lucide-react";

export type ActivityItem = {
  id: string;
  name: string;
  handle: string;
  amount: string;
  asset: "ETH";
  note: string;
  direction: "in" | "out";
  route: string;
  time: string;
  privacy: "public" | "shielded";
};

type ActivityFeedProps = {
  items: ActivityItem[];
  status: string;
};

export function ActivityFeed({ items, status }: ActivityFeedProps) {
  return (
    <section className="panel feed" aria-labelledby="activity-heading">
      <div className="section-heading">
        <div>
          <h2 id="activity-heading">Activity</h2>
          <span className="section-status">{status}</span>
        </div>
        <button className="see-all" type="button" disabled>
          See all
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <Inbox size={22} aria-hidden="true" />
          <strong>No activity</strong>
          <span>Synced public ETH transfers and RAILGUN events will appear here.</span>
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
                  <span>
                    {item.route} · {item.privacy}
                  </span>
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
