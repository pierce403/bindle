import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { ActivityItem } from "../data/activity";

type ActivityFeedProps = {
  items: ActivityItem[];
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="panel feed" aria-labelledby="activity-heading">
      <div className="section-heading">
        <h2 id="activity-heading">Activity</h2>
        <button className="icon-button" type="button" title="Filter activity">
          <ArrowDownLeft size={18} aria-hidden="true" />
        </button>
      </div>

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
              <div className={isIncoming ? "amount incoming" : "amount outgoing"}>
                {isIncoming ? "+" : "-"}
                {item.amount} {item.asset}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
