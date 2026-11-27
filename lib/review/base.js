/**
 * Resolve the diff origin for a tree review round.
 *
 * A draft round diffs from "the branch point plus the sealed plan"; a no-draft
 * round diffs from the base the caller chose. A rebase or a main merge moves
 * the branch point, so the recorded base tree can stop representing that
 * origin and main's advance would appear as the change's own work. This module
 * re-bases the origin onto the current fork and keeps the recorded base as
 * `rebasedFrom`.
 *
 * @module dsh-openspec-flow/review/base
 */

import { gitCommit, gitMergeBase, gitTree } from './store.js'
import { overlaySealTree } from '../worktree/seal.js'

/**
 * Resolve a revision's tree or refuse the round.
 * @param root - project root.
 * @param rev - base revision.
 * @returns the tree SHA.
 */
function baseTreeOf(root, rev) {
  const tree = gitTree(root, rev)
  if (tree === undefined) throw new Error(`apply review could not resolve base '${rev}'`)
  return tree
}

/**
 * Return the recorded base unchanged.
 * @param root - project root.
 * @param commit - the base commit to keep.
 * @param source - the source label to keep.
 * @returns the resolved base.
 */
function keptBase(root, commit, source) {
  return { baseCommit: commit, baseTreeSha: baseTreeOf(root, commit), baseSource: source }
}

/**
 * Resolve the base commit, base tree and source for one tree review round.
 *
 * An explicit `base` always wins. A draft baseline re-bases when the seal
 * commit's parent is an ancestor of the current fork but not the fork itself,
 * because the branch then carries main's advance. A no-draft baseline re-bases
 * only an automatic (`merge-base`) recorded base, so a deliberately deeper
 * explicit base stays authoritative. A round that cannot resolve the fork
 * keeps the recorded base.
 *
 * @param options - root, baseline, explicitBase, draftBaseCommit,
 *   recordedBaseCommit and recordedBaseSource.
 * @returns `{ baseCommit, baseTreeSha, baseSource, rebasedFrom? }`.
 * @throws when the chosen base or its tree cannot be resolved, or when the
 *   re-based tree cannot be built.
 */
export function resolveApplyBase(options) {
  const { root, baseline, explicitBase, draftBaseCommit, recordedBaseCommit, recordedBaseSource } = options
  if (explicitBase !== undefined) {
    return { baseCommit: explicitBase, baseTreeSha: baseTreeOf(root, explicitBase), baseSource: 'explicit' }
  }
  const recorded = baseline === 'draft' ? draftBaseCommit ?? recordedBaseCommit : recordedBaseCommit
  const fork = gitMergeBase(root, 'HEAD', 'origin/main')
  if (recorded === undefined) {
    if (fork === undefined) throw new Error('apply review could not determine a base commit; pass base=<commit>')
    return { baseCommit: fork, baseTreeSha: baseTreeOf(root, fork), baseSource: 'merge-base' }
  }
  const recordedSource = baseline === 'draft'
    ? (draftBaseCommit === undefined ? recordedBaseSource ?? 'merge-base' : 'seal')
    : recordedBaseSource ?? 'merge-base'
  if (fork === undefined || fork === recorded) return keptBase(root, recorded, recordedSource)
  if (baseline === 'draft' && draftBaseCommit !== undefined) {
    const sealParent = gitCommit(root, `${recorded}^1`)
    const advanced = sealParent !== undefined
      && sealParent !== fork
      && gitMergeBase(root, sealParent, fork) === sealParent
    if (!advanced) return keptBase(root, recorded, recordedSource)
    const tree = overlaySealTree({ root, sealCommit: recorded, onto: fork })
    if (tree === undefined) {
      throw new Error(`apply review could not build the re-based base tree for '${recorded}' at '${fork}'; pass base=<commit>`)
    }
    return { baseCommit: fork, baseTreeSha: tree, baseSource: 'rebase', rebasedFrom: recorded }
  }
  const automatic = baseline !== 'draft'
    && recordedBaseSource === 'merge-base'
    && gitMergeBase(root, recorded, fork) === recorded
  if (!automatic) return keptBase(root, recorded, recordedSource)
  return { baseCommit: fork, baseTreeSha: baseTreeOf(root, fork), baseSource: 'merge-base', rebasedFrom: recorded }
}
