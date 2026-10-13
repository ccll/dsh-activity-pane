/** Host catalog, durable projection caches, and explicitly retained Client instances. */
import type { SubagentAddress, SubagentCatalog } from '@deepseek-ai/dsh-subagent/client';
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session/types';
import type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
import type { SessionControlFrame, SessionSummary, SessionJob as JobView } from '../../types.ts';
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { SessionListEntry } from './lineage.ts';
import { Session } from './session.ts';
import type { SessionRemotes } from './remotes.ts';
import type { SessionTarget } from '../contract/sessions.ts';
/**
 * List arrival lifecycle, orthogonal to the pull-activity `state` axis:
 * `pending` (no successful pull yet — an empty items array means "nothing
 * arrived", not "nothing exists") → `ready` (at least one pull landed).
 * Monotone: `ready` never steps back — later pull failures and reconnect
 * re-pulls ride the `state`/`error` axis, which is where failure is modeled
 * (no `error` phase here; that would duplicate `state`).
 */
export type SessionListPhase = 'pending' | 'ready';
/** Request-local content hit returned to sidebar search consumers. */
export interface SessionSearchResultItem {
    sessionId: SessionId;
    snippet: string;
}
/** Immutable session-list snapshot for useSessionList. */
export interface SessionListSnapshot {
    items: readonly SessionListEntry[];
    state: 'idle' | 'loading' | 'error';
    /** Arrival lifecycle (see {@link SessionListPhase}); `state` stays the pull-activity axis. */
    phase: SessionListPhase;
    error: RemoteFailure | null;
    subagentsByParent: Readonly<Record<SessionId, SubagentCatalogSnapshot>>;
    /** Background jobs per session; an absent key is an empty set. */
    jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>;
}
/** One parent-addressed durable catalog projected through the sessions snapshot. */
export type SubagentCatalogSnapshot = Omit<SubagentCatalog, 'parentAvailable'> & {
    /** Absent until the first successful catalog read. */
    readonly parentAvailable?: boolean;
    state: 'loading' | 'ready' | 'error';
    error: RemoteFailure | null;
};
/** Instance cluster + frame entry + the session list. */
export declare class SessionManager {
    private readonly remote;
    private readonly sessions;
    /** In-flight Session disposals remain here after instances leave `sessions`, so manager disposal can await quiescence. */
    private readonly sessionDisposals;
    /** Per-session projection value stores, retained independently of instance arrival (the
     *  title-snapshot precedent, generalized): push frames land here whether or not the Session
     *  is instantiated (list rows read the 'title' key), and an instantiated Session adopts the
     *  same store so history-baseline seeding and frames converge on one row set. */
    private readonly projectionStores;
    private summaries;
    private listState;
    /** Arrival phase; the pending → ready edge fires on the first successful pull (see SessionListPhase). */
    private listPhase;
    private listError;
    private listInflight;
    /** Active list request's mutation log; its identity also fences completion after reconnect. */
    private listMutations;
    private readonly addresses;
    private readonly catalogs;
    private readonly catalogInflight;
    /** Catalog owners whose membership changed while a pull was in flight: one trailing refresh after it settles. */
    private readonly catalogStale;
    private readonly openCatalogs;
    private readonly catalogDebounce;
    /**
     * Background jobs per session, last-wins from Session Controller's control
     * stream. An empty set is stored as an absent key, so absence and `[]` are
     * one representation.
     */
    private readonly jobsBySession;
    private listSnapshotCache;
    /** Entry-identity cache (reference stability): list rebuilds reuse the previous entry
     *  object when every field matches — wire refreshes mint all-new summary objects, so identity
     *  must be recovered by value or every SessionListItem memo misses on every refresh. */
    private entryCache;
    private itemsCache;
    private readonly notifier;
    /** @param remote - generated Remote namespaces used by catalog and history readers. */
    constructor(remote: SessionRemotes);
    /**
     * Resolve an acquisition target without materializing a Session.
     * @param target - known identity or durable direct-parent address.
     * @returns the resolved identity with its explicit or catalog-derived history route installed.
     */
    resolveTarget(target: SessionTarget): SessionId;
    /**
     * Return the durable catalog address retained for one child.
     * @param sessionId - possible addressed child id.
     * @returns The direct-parent address, when navigation discovered one.
     */
    subagentAddress(sessionId: SessionId): SubagentAddress | undefined;
    /**
     * Resolve an address for breadcrumb navigation without retaining transport authority.
     * @param sessionId - possible child id in an already-loaded catalog.
     * @returns A retained or catalog-derived direct-parent address.
     */
    navigationAddress(sessionId: SessionId): SubagentAddress | undefined;
    /**
     * Withdraw an exact Client instance before running its teardown callbacks.
     * @param sessionId - identity to withdraw.
     * @param expected - instance being released; a replacement is left untouched.
     * @returns completion of the detached instance's stream teardown.
     */
    drop(sessionId: SessionId, expected: Session): Promise<void>;
    /**
     * Stop catalog requests and dispose every resident Session.
     * @returns once catalog requests and every Session stream have stopped.
     */
    dispose(): Promise<void>;
    private startSessionDisposal;
    private drainSessionDisposals;
    /**
     * Lazy build: return the existing instance or construct one (no auto-open —
     * the reference allocator opens history after binding the scope).
     * @param sessionId - the session to get.
     * @returns the resident instance.
     */
    get(sessionId: SessionId): Session;
    private createSession;
    /** Resident per-session projection store (create-on-demand; outlives instantiation). */
    private projectionStore;
    /**
     * Refresh one direct-child catalog, reusing its in-flight request.
     * @param parentSessionId - catalog owner.
     */
    refreshSubagents(parentSessionId: SessionId): Promise<void>;
    /**
     * Mark whether a catalog menu is consuming live membership updates.
     * @param parentSessionId - catalog owner.
     * @param open - current menu state.
     */
    setSubagentCatalogOpen(parentSessionId: SessionId, open: boolean): void;
    /** Full refresh via session.list (single-flight within one Host generation). */
    refreshList(): Promise<void>;
    /**
     * Search visible session message content without adding transient query
     * state to the list snapshot.
     * @param query - non-blank literal phrase.
     * @param signal - cancellation for superseded UI queries.
     * @returns the Host result or a folded transport error.
     */
    search(query: string, signal: AbortSignal): Promise<RemoteResult<{
        items: SessionSearchResultItem[];
        hasMore: boolean;
    }>>;
    /**
     * Contract session.create; on success merge into summaries immediately (no
     * wait for the next refresh). A created session is blank by definition
     * (entity birth precedes the first message).
     * @param opts - target workspace or working directory, plus an optional caller-owned id.
     * @returns the create result.
    */
    create(opts?: {
        workspaceId?: WorkspaceId;
        cwd?: string;
        sessionId?: SessionId;
    }): Promise<RemoteResult<{
        sessionId: SessionId;
    }>>;
    /**
     * Contract session.fork; on success merge the child into summaries
     * immediately (same synchronous-addressability guarantee as create). The
     * child carries the source's history, so it is never blank; lineage rides
     * parentSessionId so the list nests it under its source. A child published
     * before Workspace attachment fails is also reconciled into the list.
     * @param opts - source session and the optional seq anchoring the cut.
     * @returns the fork result (the child session id).
     */
    fork(opts: {
        sessionId: SessionId;
        atSeq?: SessionSeq;
    }): Promise<RemoteResult<{
        sessionId: SessionId;
    }>>;
    /**
     * Insert-or-enrich a locally synthesized summary: a new id prepends; an
     * existing entry only gains fields it lacks (the session-added frame and the
     * create() echo race — whichever lands second must fill the placeholder's
     * missing cwd/parentSessionId, never overwrite list-refresh data).
     */
    private mergeSummary;
    /** Apply immediately and retain for replay when a list response is in flight. */
    private recordMutation;
    /**
     * uSES subscription entry for useSessionList.
     * @param listener - change callback.
     * @returns the unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /**
     * Cached list snapshot (rebuilt lazily when dirty with no listeners).
     * @returns the cached reference (stable until the next flush).
     */
    getListSnapshot(): SessionListSnapshot;
    /**
     * Read cached projection values for a Session that may exist only in a loaded subagent catalog.
     * @param sessionId - Session whose control or history baseline supplied projections.
     * @returns current values, or undefined before any projection store exists.
     */
    projectionValues(sessionId: SessionId): Readonly<Partial<SessionProjectionMap>> | undefined;
    /**
     * Apply a complete control baseline or one later replacement frame.
     * @param frame - baseline or live control replacement from Session Controller.
     */
    handleControlFrame(frame: SessionControlFrame): void;
    private replaceControlBaseline;
    /**
     * Apply one Session-list addition forwarded through `ctx.remote.$on`.
     * @param summary - current Host summary for the added Session.
     */
    handleSessionAdded(summary: SessionSummary): void;
    /**
     * Apply one Session removal forwarded through `ctx.remote.$on`.
     * @param sessionId - removed Session identity.
     */
    handleSessionRemoved(sessionId: SessionId): void;
    /**
     * Apply one live Agent running-state change.
     * @param sessionId - Session whose Agent state changed.
     * @param running - current Agent running state.
     */
    handleSessionStatus(sessionId: SessionId, running: boolean): void;
    /**
     * Advance Session-list activity from one user-authored durable message.
     * @param sessionId - Session whose activity changed.
     * @param updatedAt - durable message timestamp.
     */
    handleSessionActivity(sessionId: SessionId, updatedAt: number): void;
    /**
     * Surface one live Agent failure on an already-materialized Session.
     * @param sessionId - Session whose Agent failed.
     * @param message - caller-visible failure description.
     */
    handleSessionError(sessionId: SessionId, message: string): void;
    /**
     * Repair one re-established Host-event generation with queryable baselines.
     * Discard old projection cuts before new queries, including cold Sessions
     * absent from the process-local control baseline.
     * Opened Session follow streams resume independently through API Gateway.
     */
    handleConnected(): void;
    /** Debounce membership refetches for an explicitly consumed catalog. */
    private scheduleCatalogRefresh;
    /** Apply one Agent-driver transition to loaded and in-flight catalogs. */
    private updateCatalogActivity;
    /** Preserve and project a positive expandability hint after one direct subagent publishes. */
    private markCatalogParentExpandable;
    /** Apply one positive expandability hint to every loaded catalog containing that unique row id. */
    private applyCatalogParentExpandable;
    /** Fold request-local row mutations into one catalog result before publication. */
    private withCatalogMutations;
    private buildListSnapshot;
}
//# sourceMappingURL=manager.d.ts.map