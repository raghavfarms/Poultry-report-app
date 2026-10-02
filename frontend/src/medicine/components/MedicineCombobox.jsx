import { useEffect, useId, useRef, useState } from 'react';

export default function MedicineCombobox({ medicines, value, onChange, required = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = medicines.find((medicine) => medicine._id === value);
  const term = query.trim().toLowerCase();
  const matches = medicines.filter((medicine) =>
    [medicine.name, medicine.aliasName, medicine.code].some((text) => text?.toLowerCase().includes(term)),
  ).sort((a, b) => {
    const rank = (medicine) => medicine.name.toLowerCase() === term ? 0 : medicine.name.toLowerCase().startsWith(term) ? 1 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  const activeIndex = Math.min(active, matches.length - 1);

  useEffect(() => {
    input.current?.setCustomValidity(required && !selected ? 'Select a medicine from the suggestions.' : '');
  }, [required, selected]);

  useEffect(() => {
    list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, query]);

  const choose = (medicine) => {
    onChange(medicine._id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input
        ref={input}
        role="combobox"
        aria-label="Search and select medicine"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
        autoComplete="off"
        required={required}
        placeholder="Type medicine name to search..."
        value={selected ? `${selected.name} (${selected.unit})` : query}
        onFocus={(event) => { setOpen(true); setActive(0); event.target.select(); }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange('');
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive(open ? Math.max(0, Math.min(matches.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))) : 0);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (matches[activeIndex]) choose(matches[activeIndex]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="w-full h-9 px-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
      />
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Medicines"
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.map((medicine, index) => (
            <li key={medicine._id} id={`${id}-${index}`} role="option" aria-selected={medicine._id === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(medicine)}
              className={`px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 ${index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-slate-800'}`}>
              <span className="font-semibold">{medicine.name}</span> ({medicine.unit})
              {(medicine.aliasName || medicine.code) && (
                <span className="block text-[10px] text-slate-500">{[medicine.aliasName, medicine.code].filter(Boolean).join(' · ')}</span>
              )}
            </li>
          ))}
          {matches.length === 0 && <li role="presentation" className="px-3 py-3 text-xs text-slate-500">No medicines found.</li>}
        </ul>
      )}
    </div>
  );
}
