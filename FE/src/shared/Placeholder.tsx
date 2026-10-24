export function Placeholder({
  title,
  description = "Không gian đã sẵn sàng. Chức năng sẽ được bổ sung trong giai đoạn tiếp theo.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PULSE SPORTS CENTER</div>
          <h1>{title}</h1>
        </div>
      </div>
      <section className="panel unavailable">
        <h2>Chưa khả dụng</h2>
        <p>{description}</p>
      </section>
    </>
  );
}
