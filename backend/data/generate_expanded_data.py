"""
Expanded Data Generator — All Assignment Groups with Tower & SDM Mappings

Creates 5000+ incidents across 100+ assignment groups mapped to 5 towers and 7 SDMs
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import uuid

# Load assignment group mappings
MAPPINGS = pd.read_csv('assignment_group_mappings.csv')
ASSIGNMENT_GROUPS = MAPPINGS['assignment_group'].unique().tolist()
TOWERS = MAPPINGS['tower'].unique().tolist()  # [A&I, DES, D&A, SAP, DFS]
SDMS = MAPPINGS['sdm'].unique().tolist()

print(f"Loaded {len(ASSIGNMENT_GROUPS)} assignment groups across {len(TOWERS)} towers and {len(SDMS)} SDMs")

# Fixed parameters
SERVICES = ['DPS - Training Booking Portal (TEP)', 'CG-BI Platform', 'Maximo', 'ServiceNow',
            'Data Platform', 'Financial Systems', 'A2R Platform', 'Global Traceability',
            'PowerBI', 'Master Data', 'COP-BI', 'DevOps Monitoring']

CATEGORIES = ['Application Access', 'Software & Tools', 'Application Error', 'Data & Reporting',
              'Service Request', 'Hardware', 'General', 'Infrastructure', 'Database', 'API/Integration']

RESOLUTIONS = ['Fixed', 'Workaround Provided', 'Database Updated', 'Configuration Change',
               'Access Restored', 'Patch Applied', 'Escalated to Vendor', 'Closed as Duplicate']

# Generate 5000 incidents
np.random.seed(42)
random.seed(42)

base_date = datetime(2025, 11, 1)
incidents = []

for i in range(5000):
    # Random assignment group
    assignment_group = random.choice(ASSIGNMENT_GROUPS)

    # Get tower and SDM from mapping
    mapping = MAPPINGS[MAPPINGS['assignment_group'] == assignment_group].iloc[0]
    tower = mapping['tower']
    sdm = mapping['sdm']

    # Dates
    created = base_date + timedelta(days=random.randint(0, 175), hours=random.randint(0, 23))

    # Priority distribution (more realistic)
    priority_rand = random.random()
    if priority_rand < 0.02:
        priority = 1
    elif priority_rand < 0.10:
        priority = 2
    elif priority_rand < 0.35:
        priority = 3
    else:
        priority = 4

    # State distribution
    state_rand = random.random()
    if state_rand < 0.55:
        state = 'Resolved'
        resolved = created + timedelta(hours=random.randint(2, 200))
    elif state_rand < 0.70:
        state = 'In Progress'
        resolved = None
    elif state_rand < 0.80:
        state = 'Open'
        resolved = None
    elif state_rand < 0.90:
        state = 'On Hold'
        resolved = None
    else:
        state = 'Closed'
        resolved = created + timedelta(hours=random.randint(2, 200))

    # Calculate MTTR
    if resolved:
        mttr_hours = (resolved - created).total_seconds() / 3600
        business_duration = int(mttr_hours * 3600)
    else:
        mttr_hours = (datetime.now() - created).total_seconds() / 3600
        business_duration = int(mttr_hours * 3600)

    # SLA calculation
    sla_hours = {1: 4, 2: 8, 3: 72, 4: 120}[priority]
    made_sla = 'TRUE' if mttr_hours <= sla_hours else 'FALSE'

    # Reassignments and reopens (correlated with priority)
    reassignment_count = max(0, np.random.poisson(0.5 if priority <= 2 else 0.3))
    reopen_count = max(0, np.random.poisson(0.2 if priority == 1 else 0.1))

    # Last assignment date (more recent for open tickets)
    if state == 'In Progress' or state == 'Open':
        last_assign_date = created + timedelta(days=random.randint(0, int(mttr_hours / 24)))
    else:
        last_assign_date = created + timedelta(hours=random.randint(1, 48))

    incident = {
        'Number': f'INC{random.randint(100000000, 999999999)}',
        'Created': created.strftime('%Y-%m-%d %H:%M:%S'),
        'Impacted user': f'User_{i % 500}',
        'First Assignment Group': random.choice(ASSIGNMENT_GROUPS),  # May differ from current
        'Assignment group': assignment_group,
        'Tower': tower,  # NEW
        'SDM': sdm,      # NEW
        'Service offering': random.choice(SERVICES),
        'Priority': priority,
        'Urgency': max(priority, random.randint(1, 4)),
        'State': state,
        'On hold reason': 'Waiting for vendor' if state == 'On Hold' else '',
        'Assigned to': f'{sdm.replace(" ", "_").lower()}_{i % 20}',
        'Short description': f'Issue with {random.choice(SERVICES).split()[0]} - {random.choice(["Access denied", "Performance slow", "Data missing", "Error on save", "Integration failed"])}',
        'Internal ID': str(uuid.uuid4())[:8],
        'Tags': ','.join(random.sample(CATEGORIES, k=2)),
        'Updated': (resolved if resolved else datetime.now()).strftime('%Y-%m-%d %H:%M:%S'),
        'Updated by': f'{sdm.replace(" ", "_").lower()}_{i % 15}',
        'Made SLA': made_sla,
        'SLA due': (created + timedelta(hours=sla_hours)).strftime('%Y-%m-%d %H:%M:%S'),
        'Resolution code': random.choice(RESOLUTIONS) if state in ['Resolved', 'Closed'] else '',
        'Resolved': resolved.strftime('%Y-%m-%d %H:%M:%S') if resolved else '',
        'Reopen count': reopen_count,
        'Last reopened at': '' if reopen_count == 0 else (created + timedelta(days=random.randint(5, 120))).strftime('%Y-%m-%d %H:%M:%S'),
        'Reassignment count': reassignment_count,
        'Duration': str(int(mttr_hours)),
        'Last Assignment Date': last_assign_date.strftime('%Y-%m-%d %H:%M:%S'),
        'Business duration': business_duration,
        'Resolution notes': 'Resolved by ' + random.choice(RESOLUTIONS) if state in ['Resolved', 'Closed'] else 'Pending resolution',
        'Category': random.choice(CATEGORIES),
        'Subcategory': f'{random.choice(CATEGORIES)}_sub',
    }

    incidents.append(incident)

# Create DataFrame
df = pd.DataFrame(incidents)

# Save to CSV
df.to_csv('incidents_expanded.csv', index=False)
print(f"\nGenerated {len(df)} incidents")
print(f"Assignment Groups: {df['Assignment group'].nunique()}")
print(f"Towers: {df['Tower'].nunique()}")
print(f"SDMs: {df['SDM'].nunique()}")
print(f"Services: {df['Service offering'].nunique()}")
print(f"\nSaved to incidents_expanded.csv")

# Print summary by tower and SDM
print("\n=== Distribution by Tower ===")
print(df.groupby('Tower').size())

print("\n=== Distribution by SDM ===")
print(df.groupby('SDM').size())

print("\n=== Top 10 Assignment Groups ===")
print(df['Assignment group'].value_counts().head(10))
