export default function StatCard({ label, value, sub, color = 'brand', icon }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600',
    cod: 'bg-cyan-50 text-cyan-600',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="section-title">{label}</p>
        {icon && <span className={`text-lg p-1.5 rounded-lg ${colors[color]}`}>{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-ink-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
    </div>
  )
}
