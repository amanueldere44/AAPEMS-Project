// Accessible tab bar for pages that group several screens behind one menu entry.
export default function Tabs({ tabs, active, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
              selected ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}