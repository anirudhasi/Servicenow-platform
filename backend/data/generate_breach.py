#!/usr/bin/env python3
"""
Generate sla_breach.csv — active/open incidents with SLA timing data.
Represents all towers and SDMs from assignment_group_mappings.csv.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random, os

random.seed(99)
np.random.seed(99)

TODAY = datetime(2026, 6, 4, 14, 0, 0)

# SLA resolution windows in hours (business hours approximated as wall-clock for sim)
SLA_HOURS = {1: 4, 2: 8, 3: 72, 4: 120}
PRIORITY_LABELS = {1: "1 - Critical", 2: "2 - High", 3: "3 - Moderate", 4: "4 - Standard"}

# How many active tickets per group
TICKETS_PER_GROUP = {
    "DPS-WEB-L2": 60,
    "Global-Traceability-L2": 40,
    "CG-DPS-Automation-L2": 20,
}
DEFAULT_TICKETS = 8   # for additional groups

SERVICES = {
    "A&I": ["GitHub Enterprise", "SonarQube", "Azure DevOps", "Wiki", "Insomnia", "IT Recharge"],
    "D&A": ["BI Platform", "Data Ingestion", "Reporting Portal", "COP BI", "SCM Analytics"],
    "DES": ["APM Core", "FMP Support", "Maximo", "eClaimsMobile", "Synergy IT", "DPS Web"],
    "SAP": ["SAP FI", "SAP DI", "Master Data", "Finance Support", "SAP Basis"],
}

ASSIGNEES = {
    "A&I": ["Neena Rawat (NRawat@slb.com)", "Kanchan Chaudhari (KChaudhari@slb.com)",
            "Rahul Singh (RSingh3@slb.com)", "Priya Nair (PNair2@slb.com)"],
    "D&A": ["Kanchan Chaudhari (KChaudhari@slb.com)", "Narendra Patil (NPatil1@slb.com)",
            "Amit Kumar (AKumar4@slb.com)", "Deepa Verma (DVerma2@slb.com)"],
    "DES": ["Swet Bhushan (SBhushan@slb.com)", "Vinay Pal (VPal7@slb.com)",
            "Murugan Mani (MMani5@slb.com)", "Atharva Adam (AAdam20@slb.com)"],
    "SAP": ["Ray Bhaskar (RBhaskar@slb.com)", "Tuhina Srivastav (TSrivastav@slb.com)",
            "Akhilesh Singh (ASingh5@slb.com)", "Preeti More (PMore1@slb.com)"],
}

STATES = ["In Progress", "On Hold"]
STATE_WEIGHTS = [0.75, 0.25]


def breach_time(created: datetime, priority: int) -> datetime:
    return created + timedelta(hours=SLA_HOURS[priority])


def elapsed_pct(created: datetime, priority: int) -> float:
    elapsed_h = (TODAY - created).total_seconds() / 3600
    pct = (elapsed_h / SLA_HOURS[priority]) * 100
    return round(min(pct, 150), 2)


def make_ticket(inc_num: int, group: str, tower: str) -> dict:
    priority = random.choices([1, 2, 3, 4], weights=[5, 15, 45, 35])[0]
    sla_h = SLA_HOURS[priority]

    # Create time: between (TODAY - 1.5×sla_h) and TODAY, skewed toward near-breach
    max_age_h = sla_h * 1.5
    age_h = random.uniform(0, max_age_h)
    created = TODAY - timedelta(hours=age_h)

    state = random.choices(STATES, weights=STATE_WEIGHTS)[0]
    stop_time = ""
    if state == "On Hold":
        hold_start = created + timedelta(hours=random.uniform(0.5, age_h * 0.5))
        stop_time = hold_start.strftime("%Y-%m-%d %H:%M:%S")

    b_time = breach_time(created, priority)
    e_pct  = elapsed_pct(created, priority)
    actual_time_left = int(max(0, (b_time - TODAY).total_seconds()))

    svc_list = SERVICES.get(tower, SERVICES["DES"])
    svc = random.choice(svc_list)
    assignee = random.choice(ASSIGNEES.get(tower, ASSIGNEES["DES"]))
    last_assign = created + timedelta(hours=random.uniform(0, min(age_h, 2)))

    return {
        "Task": f"INC0126{26000 + inc_num:05d}",
        "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
        "Assignment group": group,
        "Priority": PRIORITY_LABELS[priority],
        "Service": svc,
        "Service offering": svc,
        "Assigned to": assignee,
        "Reassignment count": random.choices([0, 1, 2, 3], weights=[60, 25, 10, 5])[0],
        "Reopen count": random.choices([0, 1, 2], weights=[85, 12, 3])[0],
        "State": state,
        "Business elapsed percentage": e_pct,
        "Actual time left": actual_time_left,
        "Breach time": b_time.strftime("%Y-%m-%d %H:%M:%S"),
        "Stop time": stop_time,
        "Internal ID": "",
        "Last Assignment Date": last_assign.strftime("%Y-%m-%d %H:%M:%S"),
        "Work notes": "",
        "Resolution notes": "",
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    mapping_path = os.path.join(here, "assignment_group_mappings.csv")
    out_path     = os.path.join(here, "sla_breach.csv")

    mapping = pd.read_csv(mapping_path, dtype=str).drop_duplicates(subset=["assignment_group"])
    print(f"Loaded {len(mapping)} unique groups from mapping")

    rows = []
    inc_num = 0
    for _, row in mapping.iterrows():
        group  = row["assignment_group"]
        tower  = row["tower"]
        n      = TICKETS_PER_GROUP.get(group, DEFAULT_TICKETS)
        for _ in range(n):
            rows.append(make_ticket(inc_num, group, tower))
            inc_num += 1

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"Written {len(df)} active tickets to {out_path}")
    print(f"Towers: {mapping['tower'].value_counts().to_dict()}")
    print(f"Groups: {len(mapping)}")
    by_tower = df.merge(mapping[['assignment_group','tower']], left_on='Assignment group', right_on='assignment_group')
    print(f"Tickets by tower:\n{by_tower['tower'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
