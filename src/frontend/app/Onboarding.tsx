import {useEffect, useRef, useState} from 'react';
import {api, type Place} from './domain';
import {freshDraft, questions, questionError, transportModes, type Draft, type Question} from './onboarding-model';

export function Onboarding({initial, onSave, onDraftChange}: {initial?: Draft; onSave: (draft: Draft) => void; onDraftChange: (draft: Draft) => void}) {
  const [draft, setDraft] = useState<Draft>(() => structuredClone(initial ?? freshDraft()));
  const [question, setQuestion] = useState<Question>('scope');
  const [query, setQuery] = useState(initial?.place?.name ?? '');
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const sequence = questions(draft);
  const index = sequence.indexOf(question);
  const patch = (value: Partial<Draft>) => {setDraft(d => ({...d, ...value})); setError('');};
  useEffect(() => {onDraftChange(draft);}, [draft, onDraftChange]);
  useEffect(() => {heading.current?.focus();}, [question]);
  useEffect(() => {
    setPlaces([]); setSearchError('');
    if (question !== 'place' || !query.trim() || draft.place) {setSearching(false); return;}
    const abort = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      api(`/places?q=${encodeURIComponent(query.trim())}&limit=8`, undefined, abort.signal)
        .then(r => {setPlaces(r.places); setSearching(false);})
        .catch(e => {if (e.name !== 'AbortError') {setSearchError('Town search is unavailable. Try again when the data service is ready.'); setSearching(false);}});
    }, 200);
    return () => {clearTimeout(timer); abort.abort();};
  }, [query, question, draft.place]);
  const choice = (text: React.ReactNode, selected: boolean, action: () => void) => <button type="button" className={`choice ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={action}>{text}{selected && <span className="choice-check" aria-hidden="true">✓</span>}</button>;
  let title = '', body;
  if (question === 'scope') {title = 'Where would you like to live?'; body = <div className="scope-options">{choice(<><span className="scope-symbol" aria-hidden="true">✳</span><span>Anywhere that fits</span></>, draft.scope === 'anywhere', () => patch({scope: 'anywhere'}))}{choice(<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>A specific region</span></>, draft.scope === 'specific', () => patch({scope: 'specific'}))}</div>;}
  if (question === 'place') {title = 'Where do you have in mind?'; body = <><label className="input-label"><span>Town or city</span><input autoComplete="off" placeholder="Search a town or city…" value={query} onChange={e => {setQuery(e.target.value); patch({place: null});}}/></label><div className="place-results">{places.map(p => <button type="button" className="choice" key={p.id} onClick={() => {patch({place: p}); setQuery(p.name); setPlaces([]);}}><strong>{p.name}</strong><small>{p.attributes.county ?? 'CSO urban area'}</small></button>)}</div>{draft.place && <p className="selection-note">✓ {draft.place.name} selected</p>}{searching && <p className="fine-note" role="status">Searching towns and cities…</p>}{!searching && query.trim() && !draft.place && !places.length && !searchError && <p className="fine-note">No towns or cities found. Try another name.</p>}{searchError && <p className="error" role="alert">{searchError}</p>}</>;}
  if (question === 'people') {title = 'How many people in your household?'; body = <div className="count-row"><button type="button" aria-label="One fewer person" disabled={draft.people.length === 1} onClick={() => patch({people: draft.people.slice(0, -1)})}>−</button><span>{draft.people.length}<small>{draft.people.length === 1 ? 'person' : 'people'}</small></span><button type="button" aria-label="One more person" disabled={draft.people.length === 30} onClick={() => patch({people: [...draft.people, {age: null}]})}>+</button></div>;}
  if (question.startsWith('age.')) {const i = Number(question.split('.')[1]); title = `How old is person ${i + 1}?`; body = <label className="input-label"><span>Age in years <small>(optional)</small></span><input type="number" min="0" max="120" step="1" placeholder="Optional" value={draft.people[i].age ?? ''} onChange={e => patch({people: draft.people.map((p, n) => n === i ? {age: e.target.value === '' ? null : Number(e.target.value)} : p)})}/></label>;}
  if (question === 'bedrooms') {title = 'How many bedrooms do you need?'; body = <div className="choices">{[1, 2, 3, 4, 5].map(n => <span key={n}>{choice(n === 5 ? '5+' : String(n), draft.bedrooms === n, () => patch({bedrooms: n}))}</span>)}</div>;}
  if (question === 'tenure') {title = 'Are you looking to rent or buy?'; body = <div className="choices">{choice('Rent', draft.tenure === 'rent', () => patch({tenure: 'rent'}))}{choice('Buy', draft.tenure === 'buy', () => patch({tenure: 'buy'}))}</div>;}
  if (question === 'budget') {title = draft.tenure === 'rent' ? 'What’s your monthly rent budget?' : 'What’s your purchase budget?'; body = <label className="input-label"><span>{draft.tenure === 'rent' ? '€ per month' : 'Total purchase price (€)'} <small>(optional)</small></span><input type="number" min="1" step="any" placeholder="Optional" value={draft.budgets[draft.tenure]} onChange={e => patch({budgets: {...draft.budgets, [draft.tenure]: e.target.value}})}/></label>;}
  if (question === 'transport') {title = 'How will you mainly get around?'; body = <div className="choices">{transportModes.map(([mode, name]) => <span key={mode}>{choice(name, draft.mode === mode, () => patch({mode, car: mode === 'driving' ? true : draft.mode === 'driving' ? null : draft.car}))}</span>)}</div>;}
  if (question === 'car') {title = 'Will your household have access to a car?'; body = <div className="choices">{choice('Yes', draft.car === true, () => patch({car: true}))}{choice('No', draft.car === false, () => patch({car: false}))}</div>;}
  if (question === 'save') {title = 'Ready to save your profile?'; body = <><div className="save-summary"><span><strong>{draft.people.length} {draft.people.length === 1 ? 'person' : 'people'}</strong><small>Ages: {draft.people.map(p => p.age === null ? 'not specified' : p.age).join(', ')}</small></span><span><strong>{transportModes.find(([mode]) => mode === draft.mode)?.[1]}</strong><small>{draft.car ? 'Car available' : 'No car available'}</small></span><span><strong>{draft.scope === 'anywhere' ? 'Anywhere in Ireland' : draft.place?.name}</strong><small>{draft.bedrooms}+ bedrooms · {draft.tenure === 'rent' ? 'Renting' : 'Buying'}</small></span><span><strong>{draft.budgets[draft.tenure] ? `€${Number(draft.budgets[draft.tenure]).toLocaleString('en-IE')}${draft.tenure === 'rent' ? ' / month' : ''}` : 'No budget specified'}</strong><small>Service priorities can change at any time.</small></span></div><p className="save-note">Saved in this browser when you choose “Save profile”.</p></>;}
  return <section className="prompt onboarding-prompt" aria-label="Household setup"><form onSubmit={e => {e.preventDefault(); const invalid = questionError(question, draft); setError(invalid); if (invalid) return; if (question === 'save') {try {onSave(draft);} catch {setError('This browser could not save your profile. Please allow local storage and try again.');}} else setQuestion(sequence[index + 1]);}}>
    <h1 ref={heading} tabIndex={-1}>{title}</h1><div className="answer">{body}</div>{error && <p className="error" role="alert">{error}</p>}<div className="question-actions">{index > 0 ? <button type="button" className="back" onClick={() => {setError(''); setQuestion(sequence[index - 1]);}}>← Back</button> : <span/>}<button type="submit" className="primary">{question === 'save' ? 'Save profile' : 'Continue'} <span aria-hidden="true">→</span></button></div>
  </form></section>;
}
