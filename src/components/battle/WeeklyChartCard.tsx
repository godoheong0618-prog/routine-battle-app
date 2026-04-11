export type WeeklyBarDatum = {
  day: string;
  me: number;
  opponent: number;
};

type WeeklyChartCardProps = {
  data: WeeklyBarDatum[];
  opponentName: string;
};

export default function WeeklyChartCard({ data, opponentName }: WeeklyChartCardProps) {
  return (
    <section className="battle-clone-section">
      <h2 className="battle-clone-section-title">{'\uCD5C\uADFC 7\uC77C'}</h2>

      <div className="battle-clone-chart-card">
        <div className="battle-clone-chart-bars">
          {data.map((item) => (
            <div key={item.day} className="battle-clone-chart-column">
              <div className="battle-clone-chart-pair">
                <span className="battle-clone-chart-bar battle-clone-chart-bar-dark" style={{ height: `${item.me}px` }} />
                <span className="battle-clone-chart-bar" style={{ height: `${item.opponent}px` }} />
              </div>
              <span
                className={
                  item.day === '\uC77C'
                    ? 'battle-clone-chart-day battle-clone-chart-day-active'
                    : 'battle-clone-chart-day'
                }
              >
                {item.day}
              </span>
            </div>
          ))}
        </div>

        <div className="battle-clone-chart-divider" />

        <div className="battle-clone-chart-legend">
          <span>
            <i className="battle-clone-legend-dot battle-clone-legend-dot-dark" />
            {'\uB098'}
          </span>
          <span>
            <i className="battle-clone-legend-dot" />
            {opponentName}
          </span>
        </div>
      </div>
    </section>
  );
}
