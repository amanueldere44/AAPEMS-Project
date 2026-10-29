import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title, description }) {
  return (
    <section className="panel-card flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-gold-700"><Construction size={25} /></div>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Planned implementation phase</span>
    </section>
  );
}
