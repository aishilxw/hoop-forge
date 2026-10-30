import json,re,unicodedata,hashlib
from pathlib import Path
P=Path('src/data'); players=json.loads((P/'players.json').read_text()); old={p['playerId']:p for p in players}
def norm(s):
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower();s=re.sub(r'[^a-z0-9]','',s);return re.sub(r'(?:jr|sr|iii|ii|iv)$','',s)
aliases={'moewagner':'moritzwagner','nicolasclaxton':'nicclaxton','ejharkless':'elijahharkless','ronholland':'ronaldholland','jameshuff':'jayhuff','cameronchristie':'camchristie','herbjones':'herbertjones','gregoryjackson':'ggjackson','gregoryjacksonii':'ggjackson','davidjonesgarcia':'davidjones','scottypippen':'scottypippen','walterclayton':'walterclayton'}
def key(s):n=norm(s);return aliases.get(n,n)
zh={key(r['nameEn']):(r['nameZh'],t['source']) for t in json.loads(Path('data/hupu-bilingual-rosters-2026-10-29.json').read_text()) for r in t['rows']}
# Standard established mainland names override punctuation/source alternatives.
overrides={'lebronjames':'勒布朗·詹姆斯','stephencurry':'斯蒂芬·库里','lukadoncic':'卢卡·东契奇','nikolajokic':'尼古拉·约基奇','giannisantetokounmpo':'扬尼斯·阿德托昆博','victorwembanyama':'维克托·文班亚马','shai gilgeous-alexander':'谢伊·吉尔杰斯-亚历山大'}
meta=[('BOS','波士顿凯尔特人','east','Atlantic'),('BKN','布鲁克林篮网','east','Atlantic'),('NYK','纽约尼克斯','east','Atlantic'),('PHI','费城76人','east','Atlantic'),('TOR','多伦多猛龙','east','Atlantic'),('CHI','芝加哥公牛','east','Central'),('CLE','克利夫兰骑士','east','Central'),('DET','底特律活塞','east','Central'),('IND','印第安纳步行者','east','Central'),('MIL','密尔沃基雄鹿','east','Central'),('ATL','亚特兰大老鹰','east','Southeast'),('CHA','夏洛特黄蜂','east','Southeast'),('MIA','迈阿密热火','east','Southeast'),('ORL','奥兰多魔术','east','Southeast'),('WAS','华盛顿奇才','east','Southeast'),('DEN','丹佛掘金','west','Northwest'),('MIN','明尼苏达森林狼','west','Northwest'),('OKC','俄克拉荷马城雷霆','west','Northwest'),('POR','波特兰开拓者','west','Northwest'),('UTA','犹他爵士','west','Northwest'),('GSW','金州勇士','west','Pacific'),('LAC','洛杉矶快船','west','Pacific'),('LAL','洛杉矶湖人','west','Pacific'),('PHX','菲尼克斯太阳','west','Pacific'),('SAC','萨克拉门托国王','west','Pacific'),('DAL','达拉斯独行侠','west','Southwest'),('HOU','休斯顿火箭','west','Southwest'),('MEM','孟菲斯灰熊','west','Southwest'),('NOP','新奥尔良鹈鹕','west','Southwest'),('SAS','圣安东尼奥马刺','west','Southwest')]
# First export static metadata to unblock parallel engine/UI work.
teams=[dict(id=i,nameZh=n,conference=c,division=d,playerIds=[p['playerId'] for p in players if p['teamLabel']==i]) for i,n,c,d in meta]
(P/'teams.ts').write_text("import type { TeamDefinition } from '../contracts';\nexport const NBA_TEAMS: TeamDefinition[] = "+json.dumps(teams,ensure_ascii=False,indent=2)+';\n')
missing=[]
for p in players:
 k=key(p['nameEn']);p['nameZh']=overrides.get(k,zh.get(k,(None,None))[0]);
 if not p['nameZh']:missing.append(p['nameEn'])
(P/'players.json').write_text(json.dumps(players,ensure_ascii=False)+'\n')
print('Teams available; Chinese missing:',missing)
# Replace the obsolete preseason reference with each team's currently published
# RealGM regular-season roster, retaining source evidence and stable existing IDs.
rgm=json.loads(Path('data/realgm-rosters-2026-10-29.json').read_text())
by_name={key(p['nameEn']):p for p in players}; final=[]; zh_audit=[]; missing=[]
manual={'seanpedulla':'肖恩·佩杜拉','duopreath':'杜普·里斯','tonybradley':'托尼·布拉德利','walterclayton':'沃尔特·克莱顿','isaiahstewart':'以赛亚·斯图尔特','herbertjones':'赫伯特·琼斯'}
for team in rgm:
 for r in team['rows']:
  k=key(r['name']);p=by_name.get(k)
  if p is None:
   pid='realgm-'+hashlib.sha256(k.encode()).hexdigest()[:12]
   base=dict(insideScoring=65,outsideScoring=65,interiorDefense=60,perimeterDefense=60,playmaking=60,ballHandling=60,speed=65,physicality=60,rebounding=60)
   p=dict(playerId=pid,nameEn=r['name'],nameZh=None,teamLabel=team['team'],drawPosition='guard',attributes=base,dataVersion='pending',evidence={a:dict(kind='estimated',confidence='low',sourceRefs=['local:docs/data-methodology.md#评分缺失']) for a in base})
  p['nameEn']=r['name'];p['teamLabel']=team['team'];p['drawPosition']='big' if 'C' in r['position'] else 'guard' if 'G' in r['position'] else 'wing'
  p['nameZh']=manual.get(k,overrides.get(k,zh.get(k,(None,None))[0]))
  if not p['nameZh']:missing.append(r['name'])
  zh_audit.append(dict(playerId=p['playerId'],nameEn=p['nameEn'],nameZh=p['nameZh'],source='manual-standard-transliteration' if k in manual or k in overrides else zh.get(k,(None,None))[1]))
  final.append(p)
assert len({p['playerId'] for p in final})==len(final)
assert not missing,missing
(P/'players.json').write_text(json.dumps(final,ensure_ascii=False)+'\n')
teams=[dict(id=i,nameZh=n,conference=c,division=d,playerIds=[p['playerId'] for p in final if p['teamLabel']==i]) for i,n,c,d in meta]
(P/'teams.ts').write_text("import type { TeamDefinition } from '../contracts';\nexport const NBA_TEAMS: TeamDefinition[] = "+json.dumps(teams,ensure_ascii=False,indent=2)+';\n')
Path('data/chinese-name-audit.json').write_text(json.dumps(zh_audit,ensure_ascii=False,indent=2)+'\n')
print('Current published roster:',len(final),'Chinese names:',len(zh_audit))
