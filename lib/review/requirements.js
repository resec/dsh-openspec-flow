/**
 * Rename-aware requirement resolution for the review preflights.
 *
 * The requirement-length gate and the execution preflight both compare a
 * delta requirement name with the current main spec, following the change's
 * pending renames. Keeping the index, the rename map and the resolver in one
 * module stops the two gates from drifting apart.
 *
 * @module dsh-openspec-flow/review/requirements
 */

/**
 * Read a requirement's name.
 * @param requirement - CLI requirement projection.
 * @returns the name, or an empty string.
 */
export function requirementName(requirement) {
  return typeof requirement?.name === 'string' ? requirement.name : ''
}

/**
 * Index one main-spec requirement list by exact name.
 * @param requirements - CLI requirement projections.
 * @returns name to requirement; the first duplicate wins.
 */
export function indexRequirements(requirements) {
  const byName = new Map()
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const name = requirementName(requirement)
    if (name !== '' && !byName.has(name)) byName.set(name, requirement)
  }
  return byName
}

/**
 * Build the `to -> from` rename map for each spec.
 * @param deltas - CLI delta projections.
 * @returns spec id to rename map.
 */
export function renameMaps(deltas) {
  const maps = new Map()
  for (const delta of Array.isArray(deltas) ? deltas : []) {
    if (delta?.operation !== 'RENAMED' || delta.rename === undefined) continue
    const spec = typeof delta.spec === 'string' ? delta.spec : ''
    const from = typeof delta.rename.from === 'string' ? delta.rename.from : ''
    const to = typeof delta.rename.to === 'string' ? delta.rename.to : ''
    if (spec === '' || from === '' || to === '') continue
    const map = maps.get(spec) ?? new Map()
    map.set(to, from)
    maps.set(spec, map)
  }
  return maps
}

/**
 * Resolve a requirement name against the main spec, following pending
 * renames. The walk is bounded so a rename cycle cannot hang the caller.
 * @param spec - capability id.
 * @param name - requirement name from the delta.
 * @param mainSpecs - spec id to requirement projections.
 * @param renames - spec id to `to -> from` map.
 * @returns the baseline requirement, or undefined.
 */
export function resolveRequirement(spec, name, mainSpecs, renames) {
  const byName = indexRequirements(mainSpecs?.get(spec))
  const rename = renames.get(spec) ?? new Map()
  const visited = new Set()
  let current = name
  while (current !== '' && !visited.has(current)) {
    const baseline = byName.get(current)
    if (baseline !== undefined) return baseline
    visited.add(current)
    current = rename.get(current) ?? ''
  }
  return undefined
}
