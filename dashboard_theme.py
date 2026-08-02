"""Restyles Streamlit to match the MLB-HR-DASHBOARD Next.js UI.

Values lifted from that repo, not invented:
  app/globals.css   background #09090b, text #f4f4f5, system font stack
  components/ui.js  pill buttons (radius 999, 11px, weight 800),
                    inputs/selects (radius 10, 12px, bg3 + border2)
  lib/theme.js      the C palette, already shared with streamlit_app.py

Call inject_dashboard_css() once, right after st.set_page_config().
Charts are untouched -- the palettes already match.
"""
import streamlit as st

BG, BG3 = "#09090b", "#1b2130"
TEXT, TEXT2, TEXT3 = "#f4f4f5", "#a3a6af", "#787b86"
BORDER, BORDER2 = "rgba(255,255,255,.09)", "rgba(255,255,255,.16)"
ACCENT = "#f5a623"
SANS = ("-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
        "Helvetica,Arial,sans-serif")


def inject_dashboard_css() -> None:
    st.markdown(f"""<style>
html, body, [class*="css"] {{ font-family:{SANS}; -webkit-font-smoothing:antialiased; }}
.stApp {{ background:{BG}; color:{TEXT}; }}
.block-container {{ padding-top:1.2rem; max-width:1500px; }}
#MainMenu, footer, header {{ visibility:hidden; }}

.stTabs [data-baseweb="tab-list"] {{ gap:6px; flex-wrap:wrap; border-bottom:none; padding-bottom:6px; }}
.stTabs [data-baseweb="tab"] {{
  background:rgba(255,255,255,.035); border:1px solid {BORDER};
  border-radius:999px; padding:7px 13px; font-size:11px; font-weight:800;
  color:{TEXT2}; letter-spacing:.02em;
}}
.stTabs [aria-selected="true"] {{ background:{ACCENT}22; border-color:{ACCENT}99; color:{ACCENT}; }}
.stTabs [data-baseweb="tab-highlight"], .stTabs [data-baseweb="tab-border"] {{ display:none; }}

[data-testid="stMetric"] {{
  background:rgba(255,255,255,.045); border:1px solid {BORDER};
  border-radius:14px; padding:12px 14px;
}}
[data-testid="stMetricLabel"] {{
  font-size:10px; font-weight:800; letter-spacing:.07em;
  text-transform:uppercase; color:{TEXT3};
}}
[data-testid="stMetricValue"] {{ font-size:26px; font-weight:800; color:{TEXT}; }}

.stSelectbox div[data-baseweb="select"] > div,
.stMultiSelect div[data-baseweb="select"] > div,
.stTextInput input, .stNumberInput input {{
  background:{BG3}; border:1px solid {BORDER2}; border-radius:10px;
  color:{TEXT}; font-size:12px;
}}

.stButton > button, .stDownloadButton > button {{
  background:rgba(255,255,255,.035); border:1px solid {BORDER};
  color:{TEXT2}; border-radius:999px; padding:7px 13px;
  font-size:11px; font-weight:800;
}}
.stButton > button:hover, .stDownloadButton > button:hover {{
  border-color:{ACCENT}99; color:{ACCENT}; background:{ACCENT}18;
}}

.stRadio [role="radiogroup"] {{ gap:6px; }}
.stRadio [role="radiogroup"] label {{
  background:rgba(255,255,255,.035); border:1px solid {BORDER};
  border-radius:999px; padding:5px 11px; font-size:11px; font-weight:700;
}}

[data-testid="stExpander"] {{
  background:rgba(255,255,255,.03); border:1px solid {BORDER};
  border-radius:14px; overflow:hidden;
}}
[data-testid="stDataFrame"] {{ border:1px solid {BORDER}; border-radius:12px; }}
hr {{ border-color:{BORDER}; }}
h1,h2,h3,h4 {{ letter-spacing:-.01em; font-weight:800; }}

@media (max-width:640px) {{
  .block-container {{ padding:.6rem .7rem; }}
  [data-testid="stMetricValue"] {{ font-size:19px; }}
  .stTabs [data-baseweb="tab"] {{ padding:6px 9px; font-size:10px; }}
  [data-testid="column"] {{ min-width:46% !important; }}
}}
</style>""", unsafe_allow_html=True)
