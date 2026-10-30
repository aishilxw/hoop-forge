"""Rebuild provisional game data from a local factual roster extract. No network."""
import csv,json,pathlib,unicodedata
ROOT=pathlib.Path(__file__).resolve().parents[1]
KEYS=['insideScoring','outsideScoring','interiorDefense','perimeterDefense','playmaking','ballHandling','speed','physicality','rebounding']
VERSION='roster-2026-10-20-prototype-v1'
SOURCE='https://github.com/evanz/nba-lineup-model/blob/1f22a1e286409ae2a62bcf002a6152c20217e9c9/artifacts/analysis/preseason_roster_minutes/2026-27-current-roster.csv'
# Deliberately authored game placeholders, NOT verified scouting/2K ratings.
PROFILES={'guard':[65,73,51,67,74,78,79,57,47],'wing':[73,71,66,71,61,65,72,71,65],'big':[79,48,78,54,53,48,54,83,82]}
STARS='Nikola Jokic|Luka Doncic|Giannis Antetokounmpo|Shai Gilgeous-Alexander|Victor Wembanyama|Jayson Tatum|Stephen Curry|Kevin Durant|LeBron James|Anthony Davis|Anthony Edwards|Donovan Mitchell|Devin Booker|Jalen Brunson|Tyrese Haliburton|Tyrese Maxey|Cade Cunningham|Trae Young|LaMelo Ball|Ja Morant|Kawhi Leonard|Jimmy Butler III|Jaylen Brown|Paolo Banchero|Franz Wagner|Scottie Barnes|Evan Mobley|Bam Adebayo|Chet Holmgren|Alperen Sengun|Karl-Anthony Towns|Domantas Sabonis|Lauri Markkanen|Jaren Jackson Jr.|Zion Williamson|Darius Garland|Derrick White|Jalen Williams|Jamal Murray|Pascal Siakam'.split('|')
OVERRIDES={
'Nikola Jokic':[96,82,77,52,98,80,49,91,96],
'Luka Doncic':[92,91,58,58,96,95,69,83,86],
'Giannis Antetokounmpo':[98,48,93,79,83,79,89,98,94],
'Shai Gilgeous-Alexander':[94,84,65,88,89,97,89,73,61],
'Victor Wembanyama':[92,78,99,78,73,72,78,78,96],
'Stephen Curry':[80,99,49,70,91,97,86,56,53],
'LeBron James':[95,83,79,73,96,87,78,94,87],
'Kevin Durant':[91,96,79,73,80,88,72,75,77],
'Anthony Davis':[96,59,97,75,61,62,68,94,96],
'Bam Adebayo':[86,55,94,86,77,64,73,90,91],
'Tyrese Haliburton':[77,89,53,68,97,91,83,56,51],
'Karl-Anthony Towns':[92,92,75,55,72,65,58,90,96],
'Domantas Sabonis':[92,60,75,52,89,65,52,93,98],
'Trae Young':[78,93,42,44,97,95,87,43,42],
'Derrick White':[76,87,75,93,81,79,77,65,58],
'Kawhi Leonard':[91,89,82,97,76,86,71,90,79],
'Chet Holmgren':[87,81,96,76,61,62,71,75,88],
'Jaren Jackson Jr.':[85,78,95,76,49,59,71,84,76],
}
def norm(n):return ''.join(c for c in unicodedata.normalize('NFKD',n) if not unicodedata.combining(c))
rs=list(csv.DictReader((ROOT/'data/roster-reference.csv').open()))
star_set=set(STARS);found=set();players=[];stars=[]
for r in rs:
 n=norm(r['player_name']);p=r['listed_position'];pos='guard' if p.startswith('G') else 'big' if p.startswith('C') else 'wing'
 if not p:pos='guard' # Explicit provisional fallback; listed in manifest.
 vals=OVERRIDES.get(n,PROFILES[pos][:]);isstar=n in star_set
 if isstar:
  found.add(n);stars.append(r['player_id'])
  if n not in OVERRIDES: vals=[min(94,x+12) for x in vals]
 players.append({'playerId':r['player_id'],'nameEn':r['player_name'],'nameZh':None,'teamLabel':r['team_abbreviation'],'drawPosition':pos,'attributes':dict(zip(KEYS,vals)),'dataVersion':VERSION,'evidence':{k:{'kind':'estimated','confidence':'low','sourceRefs':[SOURCE,'local:docs/data-methodology.md#provisional-ratings']} for k in KEYS}})
(ROOT/'src/data/players.json').write_text(json.dumps(players,ensure_ascii=False,separators=(',',':')))
(ROOT/'src/data/star-pool.json').write_text(json.dumps(stars))
meta={'dataVersion':VERSION,'asOfDate':'2026-10-20','status':'partial','notes':['原型数据：518人名单快照，尚未完成2026-10-29逐队官方核验。','九维能力全部为低置信度游戏占位估计，不是NBA或NBA 2K26官方评分；待2K数据映射替换。','两个未列位置球员临时归后卫：Jaylin Sellers、Josh Dix。']}
(ROOT/'src/data/roster-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
print('players',len(players),'stars',len(stars),'missing star candidates',sorted(star_set-found))
