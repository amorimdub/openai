# What does the score measure and how should missing data affect it?

Type: grilling
Labels: wayfinder:grilling
Status: open
Parent: ../map.md
Blocked by: 01, 02, 03, 04

## Question

Choose an explainable service-access score with the human team: categories, weights, distance or journey-time basis, thresholds, within-category aggregation, coverage treatment, and tie-breaking. Establish how unknown sources differ from verified absence and how candidate areas remain comparable. Confirm that proximity cannot assert capacity, admissions, quality, affordability or housing availability. Decide the JSON contract and its validation constraints.

## Comments

- A reviewable [draft scoring JSON](../../../docs/research/scoring-config.draft.json) captures proposed weights, straight-line-distance thresholds, active-category selection and unknown-data behavior. All numeric values are hypotheses for the team, not resolved decisions, validated clinical thresholds or implemented scoring.
- Household school groups and named facilities need explicit matching semantics. Clarify whether “rooms” means bedrooms or total rooms if property matching enters scope.
