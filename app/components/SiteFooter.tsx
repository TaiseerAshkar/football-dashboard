export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-xs leading-relaxed text-muted sm:px-8">
        <p className="font-medium text-foreground">Football Dashboard</p>
        <p>
          Results, tables and scorers from football-data.org. Odds from The Odds API. Predictions are estimates from a
          simple goals model and are often wrong. Nothing here is betting advice. If you bet, you must be 18 or older,
          only bet what you can afford to lose, and check the laws where you live.
        </p>
      </div>
    </footer>
  );
}
