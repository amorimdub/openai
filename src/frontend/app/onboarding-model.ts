import type {Place, Profile} from './domain';

export type Scope = 'anywhere' | 'specific';
export type Draft = {
  scope: Scope | null;
  place: Place | null;
  people: {age: number | null}[];
  bedrooms: number | null;
  tenure: 'rent' | 'buy';
  budgets: {rent: string; buy: string};
  mode: Profile['mode'] | null;
  car: boolean | null;
};
export type Question = 'scope' | 'place' | 'people' | `age.${number}` | 'bedrooms' | 'tenure' | 'budget' | 'transport' | 'car' | 'save';
export type SavedProfile = {version: 1; draft: Draft; profile: Profile};
export const profileStorageKey = 'find-your-place.profile.v1';
export const transportModes = [
  ['public_transport', 'Public transport'], ['driving', 'Car'], ['cycling', 'Cycling'], ['walking', 'Walking'], ['mixed', 'A mix'],
] as const;
export function freshDraft(): Draft {
  return {scope: null, place: null, people: [{age: null}], bedrooms: null, tenure: 'rent', budgets: {rent: '', buy: ''}, mode: null, car: null};
}
export function questions(draft: Draft): Question[] {
  return ['scope', ...(draft.scope === 'specific' ? ['place' as const] : []), 'people',
    ...draft.people.map((_, i) => `age.${i}` as const), 'bedrooms', 'tenure', 'budget', 'transport',
    ...(draft.mode === 'driving' ? [] : ['car' as const]), 'save'];
}
export function questionError(question: Question, draft: Draft): string {
  if (question === 'scope' && !draft.scope) return 'Choose anywhere that fits or a specific region.';
  if (question === 'place' && !draft.place) return 'Choose a town or city from the suggestions.';
  if (question === 'bedrooms' && !draft.bedrooms) return 'Choose the minimum number of bedrooms.';
  if (question === 'transport' && !draft.mode) return 'Choose your main way of travelling.';
  if (question === 'car' && draft.car === null) return 'Choose whether a car will be available.';
  if (question.startsWith('age.')) {
    const age = draft.people[Number(question.split('.')[1])]?.age;
    if (age !== null && (!Number.isInteger(age) || age! < 0 || age! > 120)) return 'Enter a whole age from 0 to 120 or leave it blank.';
  }
  if (question === 'budget') {
    const budget = draft.budgets[draft.tenure];
    if (budget !== '' && (!Number.isFinite(Number(budget)) || Number(budget) <= 0)) return 'Use a positive budget or leave it blank.';
  }
  return '';
}
export function profileFromDraft(draft: Draft, radiusKm = 10): Profile {
  return {people: structuredClone(draft.people), bedrooms: draft.bedrooms!, tenure: draft.tenure,
    budget: draft.budgets[draft.tenure], ages: draft.people.filter(p => p.age !== null && p.age <= 18).map(p => p.age).join(', '),
    mode: draft.mode!, car: draft.mode === 'driving' || draft.car === true, radiusKm};
}
export function saveProfile(draft: Draft, storage: Pick<Storage, 'setItem'>): SavedProfile {
  const invalid = questions(draft).map(q => questionError(q, draft)).find(Boolean);
  if (invalid) throw new Error(invalid);
  const saved: SavedProfile = {version: 1, draft: structuredClone(draft), profile: profileFromDraft(draft)};
  storage.setItem(profileStorageKey, JSON.stringify(saved));
  return saved;
}
export function readProfile(storage: Pick<Storage, 'getItem'>): SavedProfile | null {
  try {
    const saved = JSON.parse(storage.getItem(profileStorageKey) ?? 'null');
    if (saved?.version !== 1) return null;
    const d = saved.draft;
    if (!d || !['anywhere', 'specific'].includes(d.scope) || !['rent', 'buy'].includes(d.tenure) ||
      !Array.isArray(d.people) || d.people.length < 1 || d.people.length > 30 ||
      !d.people.every((p: {age: unknown}) => p && (p.age === null || (Number.isInteger(p.age) && Number(p.age) >= 0 && Number(p.age) <= 120))) ||
      !Number.isInteger(d.bedrooms) || d.bedrooms < 1 || d.bedrooms > 5 ||
      !transportModes.some(([mode]) => mode === d.mode) || typeof d.car !== 'boolean' ||
      typeof d.budgets?.rent !== 'string' || typeof d.budgets?.buy !== 'string' ||
      Object.values(d.budgets).some(b => b !== '' && (!Number.isFinite(Number(b)) || Number(b) <= 0)) ||
      (d.scope === 'specific' && (!d.place?.id || !d.place?.name || !d.place?.geometry?.coordinates || !d.place?.attributes))) return null;
    // Rebuild derived fields instead of trusting cached household/API parameters.
    return {version: 1, draft: d, profile: profileFromDraft(d)};
  } catch { return null; }
}
