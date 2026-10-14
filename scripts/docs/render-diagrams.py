"""Render source-controlled Graphviz use-case figures (requires dot)."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/diagrams'
OUT.mkdir(parents=True, exist_ok=True)


def render(name, title, actors, cases, associations, includes=()):
    q = json.dumps
    lines = ['digraph G {', 'graph [rankdir=LR, bgcolor="transparent", pad="0.15", nodesep="0.13", ranksep="0.55", fontname="DejaVu Sans", fontsize=14];', 'node [fontname="DejaVu Sans", fontsize=11, color="#506481", penwidth=1, style=filled, fillcolor="#edf4fc"];', 'edge [color="#708096", penwidth=0.9, arrowhead=none];']
    for key, label in actors.items():
        lines.append(f'{key} [shape=box, style="rounded,filled", fillcolor="#ffffff", label={q("<<actor>>\n" + label)}];')
    lines.append('subgraph cluster_system {')
    lines.append(f'label={q(title)}; color="#617494"; style=rounded; margin=16;')
    for key, label in cases.items():
        lines.append(f'{key} [shape=ellipse, margin="0.13,0.07", label={q(label)}];')
    lines.append('}')
    for actor, targets in associations.items():
        for target in targets:
            lines.append(f'{actor} -> {target};')
    for source, target in includes:
        lines.append(f'{source} -> {target} [style=dashed, arrowhead=vee, label="<<include>>", fontname="DejaVu Sans", fontsize=9, color="#326b88"];')
    lines.append('}')
    source = OUT / f'{name}.dot'
    source.write_text('\n'.join(lines) + '\n')
    for ext in ['svg', 'png']:
        subprocess.run(['dot', f'-T{ext}', '-Gdpi=150', str(source), '-o', str(OUT / f'{name}.{ext}')], check=True)

render('01-public', 'Smart HMS: public access',
       {'Visitor': 'Visitor', 'Gateway': 'Email gateway\n(live setup pending)'},
       {'Home': 'View published hospital\ncontact details and hours', 'Directory': 'Browse approved\ndoctors and services', 'Register': 'Register a patient account', 'Login': 'Sign in', 'Recover': 'Recover password', 'Language': 'Choose interface language'},
       {'Visitor': ['Home', 'Directory', 'Register', 'Login', 'Recover', 'Language'], 'Gateway': ['Recover']})
render('02-patient', 'Smart HMS: patient workspace',
       {'Patient': 'Patient', 'Gateway': 'Email / SMS gateway\n(live setup pending)'},
       {'Profile': 'Update contact profile', 'Book': 'Browse slots and\nbook appointment', 'Validate': 'Validate availability\nand booking conflicts', 'Change': 'Reschedule or cancel visit', 'Records': 'Read own records,\nprescriptions and bills', 'Guide': 'Get department guidance', 'Rules': 'Evaluate bounded\nEnglish keyword rules', 'Feedback': 'Submit completed-visit\nfeedback', 'Updates': 'Read notifications\nand appointment charts', 'Preferences': 'Set delivery preferences\nand view delivery history', 'Deliver': 'Deliver queued update'},
       {'Patient': ['Profile', 'Book', 'Change', 'Records', 'Guide', 'Feedback', 'Updates', 'Preferences'], 'Gateway': ['Deliver']},
       [('Book', 'Validate'), ('Guide', 'Rules')])
render('03-care-team', 'Smart HMS: care team',
       {'Doctor': 'Doctor', 'Reception': 'Receptionist'},
       {'Queue': 'View own paginated queue\nand daily timeline', 'History': 'Review assigned history\nand reported allergies', 'Consult': 'Start, save and complete\nconsultation', 'Prescription': 'Create or revise\nprescription with history', 'Schedule': 'Manage own schedule', 'Intake': 'Register walk-in\nand update intake', 'Checkin': 'Manage bookings\nand check in arrivals', 'Bill': 'Review and itemise bill', 'Payment': 'Record received payment'},
       {'Doctor': ['Queue', 'History', 'Consult', 'Prescription', 'Schedule'], 'Reception': ['Intake', 'Checkin', 'Bill', 'Payment']})
render('04-administration', 'Smart HMS: administration',
       {'Admin': 'Administrator'},
       {'Staff': 'Manage staff access\nand approved public profiles', 'Patients': 'Deactivate or reactivate\npatient accounts', 'Departments': 'Create, edit, publish\nor deactivate departments', 'Schedule': 'Manage appointments\nand doctor schedules', 'Billing': 'Review billing\nand reverse recorded payment', 'Reports': 'Generate reports\nand export CSV / print PDF', 'Feedback': 'Review private feedback', 'Audit': 'Review audit events\nand recent login IPs', 'Hospital': 'Draft, publish or withdraw\nhospital information', 'Charts': 'Explore role-scoped charts', 'Delivery': 'Monitor email / SMS\ndelivery history'},
       {'Admin': ['Staff', 'Patients', 'Departments', 'Schedule', 'Billing', 'Reports', 'Feedback', 'Audit', 'Hospital', 'Charts', 'Delivery']})
print('Rendered four use-case views as editable DOT, SVG and PNG.')
