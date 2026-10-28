"""Role hierarchy and permission rules (server-side RBAC source of truth).

The product defines five roles (app.tickets.schemas.Role). For authorization we
order them by privilege and derive a numeric rank. Guards compare ranks, so a
lower role is rejected on a higher-privilege action. `auditor` is a read-and-
export role: it sits above `monitor` in trust but is not allowed to mutate
operational data; mutation guards therefore check `can_*` predicates rather than
rank alone where the rule is not a simple ladder.
"""

from __future__ import annotations

from app.tickets.schemas import Role

# Privilege ladder, low to high. Higher rank implies every lower capability,
# except where an explicit predicate narrows it (see auditor notes below).
_RANK: dict[str, int] = {
    Role.MONITOR.value: 10,
    Role.AUDITOR.value: 20,
    Role.SUPERVISOR.value: 30,
    Role.COUNTY_ADMIN.value: 40,
    Role.SUPER_ADMIN.value: 50,
}


def rank(role: str) -> int:
    """Numeric privilege rank for a role; unknown roles rank lowest."""
    return _RANK.get(role, 0)


def at_least(role: str, minimum: Role) -> bool:
    """True when `role` is at or above the `minimum` rung on the ladder."""
    return rank(role) >= rank(minimum.value)


# ── Capability predicates. Each maps to a concrete action in the UI/API. ──


def can_review_tickets(role: str) -> bool:
    """Set the monitor call and confirm/override/dispute a ticket."""
    # Monitors and supervisors do review work; county/super admins may too.
    # Auditors are read-only and cannot change a ticket's decision.
    return role in {
        Role.MONITOR.value,
        Role.SUPERVISOR.value,
        Role.COUNTY_ADMIN.value,
        Role.SUPER_ADMIN.value,
    }


def can_manage_trucks(role: str) -> bool:
    """Add, edit, or remove trucks and evidence sources."""
    return at_least(role, Role.SUPERVISOR) and role != Role.AUDITOR.value


def can_manage_sources(role: str) -> bool:
    """Connect, edit, pause, or remove evidence sources."""
    return can_manage_trucks(role)


def can_manage_events(role: str) -> bool:
    """Create or edit events and their rate tables."""
    return at_least(role, Role.COUNTY_ADMIN)


def can_ingest(role: str) -> bool:
    """Upload a clip for analysis."""
    return can_review_tickets(role)


def can_manage_users(role: str) -> bool:
    """Open the Users admin and create/edit/remove members."""
    return at_least(role, Role.COUNTY_ADMIN)


def can_act_on_user(actor_role: str, target_role: str) -> bool:
    """Whether `actor_role` may create/edit/delete a member with `target_role`.

    An admin may only manage members at or below their own rank, and may not
    promote anyone above themselves. This stops a county_admin from editing a
    super_admin or minting a peer/superior.
    """
    if not can_manage_users(actor_role):
        return False
    return rank(actor_role) >= rank(target_role)


# Exposed to the frontend so the UI can hide/disable what the role cannot do.
def capabilities(role: str) -> dict[str, bool]:
    """A flat capability map for the signed-in role."""
    return {
        "review_tickets": can_review_tickets(role),
        "manage_trucks": can_manage_trucks(role),
        "manage_sources": can_manage_sources(role),
        "manage_events": can_manage_events(role),
        "ingest": can_ingest(role),
        "manage_users": can_manage_users(role),
    }
