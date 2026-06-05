#!/usr/bin/env python3
"""
SLA Breach / Near-Breach Risk Dataset Generator
Produces ~300 rows matching the live SLB ServiceNow export format observed in screenshots.

Key domain realism:
- On Hold tickets (52%) have paused SLA clocks → low elapsed % despite being old
- In Progress tickets (48%) have running SLA clocks → wider elapsed % range
- Business elapsed % = only counts active (non-hold) business time
- Actual time left = remaining business-seconds (negative = overdue)
- Breach time = absolute SLA deadline datetime
- Stop time = when current On Hold period started (blank for In Progress)
- ~20% of tickets linked to known bugs via Internal ID
- Work notes reflect real ServiceNow automation patterns:
    IAR-User bot failures, Predictive Intelligence suggestions, Quick Assist checks
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random, os

random.seed(77)
np.random.seed(77)

TODAY = datetime(2026, 6, 4, 14, 0, 0)

# ── Assignment groups & weights ───────────────────────────────────────────────
GROUPS   = ["DPS-WEB-L2", "Global-Traceability-L2", "CG-DPS-Automation-L2"]
G_WGTS   = [0.68, 0.22, 0.10]

# ── Priorities, SLA (business hours), weights ─────────────────────────────────
PRIORITIES  = ["4 - Standard", "3 - Moderate", "2 - High", "1 - Critical"]
PRI_WGTS    = [0.78, 0.17, 0.04, 0.01]
SLA_BIZ_H   = {"4 - Standard": 72, "3 - Moderate": 24, "2 - High": 8, "1 - Critical": 4}

STATES      = ["On Hold", "In Progress"]
STATE_WGTS  = [0.52, 0.48]

# ── Services per group (service, service_offering, weight) ────────────────────
SERVICES = {
    "DPS-WEB-L2": [
        ("FP215 and LTB",                           "FP215 and LTB.",                                    0.10),
        ("Synergy IT",                              "Synergy",                                           0.08),
        ("General Service System",                  "DPS General Service System",                        0.08),
        ("eClaimsMobile",                           "eClaimsMobile.",                                    0.07),
        ("Access Now (Facility Self Service Portal)","Access Now",                                       0.07),
        ("SAP User Portal",                         "SAP User Portal.",                                  0.06),
        ("ePTW",                                    "ePermit",                                           0.06),
        ("SL Treasury Hub",                         "SL Treasury Hub.",                                  0.05),
        ("GlobalProtect",                           "GlobalProtect-ClientIssue",                         0.05),
        ("MDM Search portal",                       "DPS PowerApps MDM Search",                          0.05),
        ("CSR Mobile",                              "CSR Mobile (CSR Digitalization And Auto Tracking)", 0.04),
        ("Finance Portal v2",                       "Sharepoint-Finance Portal v2",                      0.04),
        ("Remote Operations",                       "RO Tech Support",                                   0.04),
        ("COI Disclosure",                          "COI Disclosure Tool",                               0.04),
        ("Modern Identity - Corporate Directory",   "LDAP-Directory Services",                           0.04),
        ("PHUBv5",                                  "Payment Processes and AP Runs - PHUB",              0.04),
        ("ITT SAP - ECC",                           "Approval Limits - ITT SAP",                        0.03),
        ("SAHL",                                    "SAHL.",                                             0.03),
        ("BlueWorld",                               "BlueWorld",                                         0.03),
        ("ePermit",                                 "ePermit",                                           0.03),
        ("Synergy",                                 "Synergy",                                           0.03),
        ("MDM Search portal",                       "DPS PowerApps MDM Search",                          0.02),
    ],
    "Global-Traceability-L2": [
        ("GT",      "Global Traceability",  0.28),
        ("GT",      "Supply Visibility",    0.22),
        ("GT",      "BlueWorld",            0.20),
        ("GT",      "GT Mobile",            0.16),
        ("BlueMM",  "BlueMM - IM (ITE)",    0.14),
    ],
    "CG-DPS-Automation-L2": [
        ("Generic Technical Service", "Generic Technical Service Offering", 0.50),
        ("iWorkPlace",                "iWorkPlace.",                        0.30),
        ("eClaimsMobile",             "eClaimsMobile.",                     0.20),
    ],
}

# ── Assignees per group ────────────────────────────────────────────────────────
ASSIGNEES = {
    "DPS-WEB-L2": [
        ("Shwetha Jeevankumar Suvarna", "SSuvarna@slb.com"),
        ("Swet Bhushan",                "SBhushan2@slb.com"),
        ("Atharva Shrinivas Adam",      "AAdam20@slb.com"),
        ("Vinay Pal",                   "VPal7@slb.com"),
        ("Saurabh Saraswat",            "SSaraswat2@slb.com"),
        ("Godavari Bai M R",            "GR51@slb.com"),
        ("Shivam Kumar Rajput",         "SRajput6@slb.com"),
    ],
    "Global-Traceability-L2": [
        ("Vinay Pal",       "VPal7@slb.com"),
        ("Godavari Bai M R","GR51@slb.com"),
        ("Kris Cruickshank","KCruickshank@slb.com"),
    ],
    "CG-DPS-Automation-L2": [
        ("Vishu Gupta",  "VGupta24@slb.com"),
        ("Murugan Mani", "MMani5@slb.com"),
        ("Swet Bhushan", "SBhushan2@slb.com"),
    ],
}

END_USERS = [
    ("Xin Yin Lim",         "XLim8@slb.com"),
    ("Na Dong",             "NDong@slb.com"),
    ("Adryana Azam",        "AAzam8@slb.com"),
    ("Juan Garcia",         "JGarcia430@slb.com"),
    ("Alexander Kjaervoll", "AKjaervoll@slb.com"),
    ("Alexander Slyusar",   "ASlyusar@slb.com"),
    ("Kotchaphan Tosu",     "PTosu@slb.com"),
    ("Magdalena Stoica",    "MStoica5@slb.com"),
]

def fmt_dt(dt):
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def rand_dt(start, end):
    delta = max(1, int((end - start).total_seconds()))
    return start + timedelta(seconds=random.randint(0, delta))

def rand_device():
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "SLB-" + "".join(random.choices(chars, k=8))

def build_work_notes(created, assigned_to, service, offering, state):
    """Build realistic ServiceNow work note thread (newest-first like SNOW UI)."""
    entries = []
    t = created

    # 1. Ticket creation (always present)
    t += timedelta(seconds=random.randint(1, 30))
    src = random.choice(["Email Integration", "System"])
    entries.append((t, src, "Ticket Automatically Created With Default Parameters"))

    # 2. Record Producer note (50% of tickets)
    if random.random() < 0.50:
        t += timedelta(seconds=random.randint(10, 60))
        eu_name, eu_email = random.choice(END_USERS)
        entries.append((t, f"{eu_name} ({eu_email})",
                        "This incident submitted from \"Create an IT Ticket\""))
        entries.append((t + timedelta(seconds=2), f"{eu_name} ({eu_email})",
                        "Created using Record Producer : Create an IT Ticket"))

    # 3. Predictive Intelligence (65% of tickets)
    if random.random() < 0.65:
        t += timedelta(seconds=random.randint(30, 120))
        conf = random.uniform(14.5, 49.8)
        action = "has updated" if conf >= 35 else "suggests to update"
        pi_text = (f"Predictive Intelligence {action} incident:\n"
                   f"Service as \"{service}\"\n"
                   f"Service Offering as \"{offering}\" "
                   f"with confidence of {conf:.2f}% (Threshold is 35%)\n--------")
        entries.append((t, "System", pi_text))

    # 4. Quick Assist device check (60% of tickets)
    if random.random() < 0.60:
        t += timedelta(seconds=random.randint(60, 300))
        entries.append((t, "System",
                        f"Quick Assist already enabled for device '{rand_device()}'."))
        if random.random() < 0.3:
            t += timedelta(seconds=3)
            entries.append((t, "System",
                            f"Quick Assist already enabled for device '{rand_device()}'."))

    # 5. IAR-User auto-routing failure (55% of tickets)
    if random.random() < 0.55:
        t += timedelta(seconds=random.randint(300, 1200))
        entries.append((t, "IAR-User (IAR-User@slb.com)",
                        "An agent can better assist you with this task. "
                        "I'm unassigning myself from the task for an agent to pick it up."))

    # 6. Agent assignment note (75% of tickets)
    if assigned_to and random.random() < 0.75:
        t += timedelta(hours=random.uniform(0.5, 6))
        entries.append((t, assigned_to,
                        "[code]<p>assigned</p>[/code]"))

    # 7. Agent progress / investigation note (40% of tickets)
    if random.random() < 0.40:
        t += timedelta(hours=random.uniform(4, 24))
        updates = [
            "[code]<p>Under investigation. Checking system logs for root cause.</p>[/code]",
            "[code]<p>Waiting for vendor response. Escalated to L3 support.</p>[/code]",
            "[code]<p>User contacted and provided initial guidance. Awaiting confirmation.</p>[/code]",
            "[code]<p>Waiting for DB XCAP to investigate on deployment details and possible root cause.</p>[/code]",
            "[code]<p>User is available, but couldn't connect. Remote session scheduled.</p>[/code]",
            "[code]<p>Change request raised for permanent fix. Workaround applied temporarily.</p>[/code]",
        ]
        entries.append((t, assigned_to or "System", random.choice(updates)))

    # 8. End-user follow-up (25% of tickets)
    if random.random() < 0.25:
        t += timedelta(hours=random.uniform(12, 72))
        eu_name, eu_email = random.choice(END_USERS)
        followups = [
            "Dear team, could you help us with this incident please?",
            "Hi, any update on this? It's still impacting our operations.",
            "[code]<p>Dear Team,<br>We seek for your help if you're the correct support for this issue. "
            "Appreciate your support.<br>Thank you.</p>[/code]",
            "Still unresolved. This is blocking our business process.",
        ]
        entries.append((t, f"{eu_name} ({eu_email})", random.choice(followups)))

    # Sort newest-first (ServiceNow displays most-recent at top)
    entries.sort(key=lambda x: x[0], reverse=True)
    return "\n\n".join(
        f"{fmt_dt(e[0])} - {e[1]} (Work notes)\n{e[2]}" for e in entries
    )


def generate(n=300):
    records = []
    inc_base = 600_000 + random.randint(0, 30_000)

    for _ in range(n):
        inc_base += random.randint(1, 6)

        grp      = random.choices(GROUPS, weights=G_WGTS)[0]
        priority = random.choices(PRIORITIES, weights=PRI_WGTS)[0]
        state    = random.choices(STATES, weights=STATE_WGTS)[0]
        sla_h    = SLA_BIZ_H[priority]

        # Service / offering
        pool = SERVICES[grp]
        wts  = [s[2] for s in pool]; wts = [w / sum(wts) for w in wts]
        idx  = random.choices(range(len(pool)), weights=wts)[0]
        service, offering, _ = pool[idx]

        # Assignee
        agent_name, agent_email = random.choice(ASSIGNEES[grp])
        assigned_to = f"{agent_name} ({agent_email})"

        # ── Created datetime & breach time ────────────────────────────────────
        # On Hold tickets: can be old (April–May) because SLA clock was mostly paused
        # In Progress tickets: typically created within last few SLA cycles
        if state == "On Hold":
            # Old tickets — created anywhere from April to early June
            created = rand_dt(datetime(2026, 4, 1), TODAY - timedelta(hours=48))
            # Business elapsed % only 5–38% despite age (clock was mostly paused)
            elapsed_pct = random.uniform(5.0, 38.0)
        else:
            # In Progress — more recent, SLA clock running
            # Mix of near-breach and already-breached
            if random.random() < 0.45:
                # Already breached (elapsed > 100%)
                elapsed_pct = random.uniform(100.5, 175.0)
                created_days_ago = (elapsed_pct / 100) * sla_h / 8   # rough calendar days
                created = TODAY - timedelta(hours=created_days_ago * 8 + random.uniform(0, 24))
            else:
                # Approaching breach (60–98% elapsed)
                elapsed_pct = random.uniform(60.0, 98.5)
                created_days_ago = (elapsed_pct / 100) * sla_h / 8
                created = TODAY - timedelta(hours=created_days_ago * 8 + random.uniform(0, 12))

        # Clamp created to realistic range
        created = max(created, datetime(2026, 4, 1))
        created = min(created, TODAY - timedelta(hours=1))

        # Breach time = when SLA expires in absolute time
        # Derived from: elapsed_pct tells us how much SLA is consumed
        # remaining_biz_hours = sla_h * (1 - elapsed_pct/100)
        remaining_biz_h = sla_h * (1.0 - elapsed_pct / 100.0)
        # Convert business hours to rough calendar hours (1.4x factor for non-business time)
        breach_time = TODAY + timedelta(hours=remaining_biz_h * 1.4)
        # For already-breached, breach_time is in the past
        if elapsed_pct >= 100:
            overdue_biz_h = sla_h * (elapsed_pct / 100.0 - 1.0)
            breach_time = TODAY - timedelta(hours=overdue_biz_h * 1.4)

        # Actual time left = business seconds (positive = remaining, represents |remaining|)
        actual_time_left = int(abs(remaining_biz_h) * 3600)

        # ── Stop time (On Hold only) ──────────────────────────────────────────
        stop_time = ""
        if state == "On Hold":
            # SLA clock stopped when ticket went On Hold
            hold_start = rand_dt(created + timedelta(hours=1), TODAY - timedelta(hours=1))
            stop_time = fmt_dt(hold_start)

        # ── Reassignment count ────────────────────────────────────────────────
        reass_wgts = [0.62, 0.22, 0.11, 0.05]
        reassignment_count = random.choices([0, 1, 2, 3], weights=reass_wgts)[0]
        reopen_count = random.choices([0, 1], weights=[0.95, 0.05])[0]

        # ── Last Assignment Date ──────────────────────────────────────────────
        # On Hold → assigned before the hold started; In Progress → more recent
        if state == "On Hold" and stop_time:
            hold_dt = datetime.strptime(stop_time, "%Y-%m-%d %H:%M:%S")
            last_assign = rand_dt(created + timedelta(hours=0.5), hold_dt)
        elif reassignment_count > 0:
            # Each reassignment was recent; last one within last 1–7 days
            last_assign = rand_dt(
                TODAY - timedelta(hours=reassignment_count * 36),
                TODAY - timedelta(hours=max(1, reassignment_count * 4))
            )
        else:
            # First and only assignment — happened shortly after creation
            last_assign = rand_dt(created, created + timedelta(hours=min(6, sla_h * 0.15 + 0.5)))

        # ── Internal ID (20% chance — linked to known bug/defect) ────────────
        internal_id = ""
        if random.random() < 0.20:
            bug_num  = random.randint(6_400_000, 6_600_000)
            link_dt  = rand_dt(datetime(2026, 3, 1), TODAY)
            date_str = link_dt.strftime("%d-%m-%Y")
            fmt = random.choice([
                f"WH | BUG {bug_num} | {date_str}",
                f"WH | Bug | Bug{bug_num} | {date_str}",
            ])
            internal_id = fmt

        # ── Work notes ────────────────────────────────────────────────────────
        work_notes = build_work_notes(created, assigned_to, service, offering, state)

        records.append({
            "Task":                       f"INC012{inc_base}",
            "Created":                    fmt_dt(created),
            "Assignment group":           grp,
            "Priority":                   priority,
            "Service":                    service,
            "Service offering":           offering,
            "Assigned to":                assigned_to,
            "Reassignment count":         reassignment_count,
            "Reopen count":               reopen_count,
            "State":                      state,
            "Business elapsed percentage":round(elapsed_pct, 2),
            "Actual time left":           actual_time_left,
            "Breach time":                fmt_dt(breach_time),
            "Stop time":                  stop_time,
            "Internal ID":                internal_id,
            "Last Assignment Date":       fmt_dt(last_assign),
            "Work notes":                 work_notes,
            "Resolution notes":           "",
        })

    df = pd.DataFrame(records)
    out = os.path.join(os.path.dirname(__file__), "sla_breach.csv")
    df.to_csv(out, index=False)
    print(f"Generated {len(df)} SLA breach records -> {out}")
    print(f"Already breached (elapsed>=100%): {(df['Business elapsed percentage'] >= 100).sum()}")
    print(f"State:\n{df['State'].value_counts().to_string()}")
    print(f"Priority:\n{df['Priority'].value_counts().to_string()}")
    print(f"Group:\n{df['Assignment group'].value_counts().to_string()}")
    print(f"Elapsed % stats:\n  min={df['Business elapsed percentage'].min():.1f}%"
          f"  median={df['Business elapsed percentage'].median():.1f}%"
          f"  max={df['Business elapsed percentage'].max():.1f}%")
    return df

if __name__ == "__main__":
    generate(300)
