import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import D3GeographicMap from './components/D3GeographicMap'
import { MUN_BY_REGIONAL, REGIONAIS } from './data/aredMapData'
import { enrollments as staticEnrollments, etecs as staticEtecs, exemptionMetrics, options as staticOptions, snapshotSeries as staticSnapshotSeries, sourceMetadata as staticSourceMetadata, type Enrollment, type EtecPoint, type SnapshotSeries } from './data/mockData'

type Filters={regional:string[];city:string[];etec:string[];modality:string[];course:string[];period:string[]}; type FilterKey=keyof Filters
type OfferStatus='comfortable'|'attention'|'low'
type AnalysisScope={presential:boolean;ead:boolean;trainees:boolean}
type DashboardPayload={enrollments:Enrollment[];etecs:EtecPoint[];snapshotSeries:SnapshotSeries[];sourceMetadata:typeof staticSourceMetadata}
const initialFilters:Filters={regional:[],city:[],etec:[],modality:[],course:[],period:[]}; const number=new Intl.NumberFormat('pt-BR')
const apiBaseUrl=(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'')
const apiUrl=(path:string)=>`${apiBaseUrl}${path}`
const readJson=async<T,>(response:Response):Promise<T>=>{const text=await response.text();if(!text)return {} as T;try{return JSON.parse(text) as T}catch{throw new Error(response.ok?'O servidor respondeu em um formato inválido.':text)}}
const formatSnapshotDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
const normalizeName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const mapRegionalByMunicipality=new Map(Object.entries(MUN_BY_REGIONAL).flatMap(([regional,data])=>data.features.map(feature=>[normalizeName(String(feature.properties.name??'')),regional])))
const mapRegionalFallbackByMunicipality=new Map([['campinas','Campinas Sul']])
type HistoryPoint={referenceAt:string;total:number;paid:number;unpaid:number;trainee:number;regular:number;vacancies:number}; type ChartData=Enrollment[]&{history?:HistoryPoint[]}
const offerStatusFor=(item:Enrollment):OfferStatus=>{const demand=item.vacancies?(item.paid+item.unpaid)/item.vacancies:0;return demand>=1.5?'comfortable':demand>=1?'attention':'low'}
function SelectFilter({label,value,values,onChange,etecOptions=[]}:{label:string;value:string[];values:string[];onChange:(value:string[])=>void;etecOptions?:EtecPoint[]}){
 const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const filterRef=useRef<HTMLDivElement>(null); const menuId=useId(); const unavailable=values.length===0
 const displayLabel=label==='Etec'?'Local de oferta':label; const optionLabel=(item:string)=>label==='Etec'?(etecOptions.find(etec=>etec.name===item)?.label??item):item
 const normalizedQuery=normalizeName(query); const visibleValues=values.filter(item=>normalizeName(optionLabel(item)).includes(normalizedQuery)); const selectionLabel=!value.length?'Todos':value.length===1?optionLabel(value[0]):`${value.length} selecionados`
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!filterRef.current?.contains(event.target as Node))setOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}},[])
 const toggle=(item:string)=>onChange(value.includes(item)?value.filter(selected=>selected!==item):[...value,item])
 const toggleAll=()=>onChange(value.length===values.length?[]:[...values])
 return <div className="filter" ref={filterRef}>
<div className="filter-title"><span>{displayLabel}</span></div>
<button className="filter-trigger" type="button" disabled={unavailable} aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(current=>!current)}><b>{unavailable?'Indisponível nesta fonte':selectionLabel}</b><i aria-hidden="true">⌄</i></button>
{open&&!unavailable&&<div className="filter-menu" id={menuId} role="dialog" aria-label={`Opções de ${displayLabel}`}>
<input className="filter-search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar" aria-label={`Pesquisar ${displayLabel}`}/>
<label className="filter-option filter-select-all"><input type="checkbox" checked={value.length===values.length} onChange={toggleAll}/><span>Selecionar todos</span></label>
<div className="filter-options">{visibleValues.length?visibleValues.map(item=><label className="filter-option" key={item}><input type="checkbox" checked={value.includes(item)} onChange={()=>toggle(item)}/><span>{optionLabel(item)}</span></label>):<p>Nenhum resultado para a busca.</p>}</div>
</div>}
</div>
}
function TrendChart({data,target}:{data:ChartData;target:number}){
 const svgRef=useRef<SVGSVGElement>(null); const [viewHeight,setViewHeight]=useState(265)
 useEffect(()=>{const svg=svgRef.current;if(!svg)return undefined;const update=()=>{if(!svg.clientWidth)return;const next=Math.max(265,Math.round(svg.clientHeight/svg.clientWidth*680));setViewHeight(current=>current===next?current:next)};const observer=new ResizeObserver(update);observer.observe(svg);update();return()=>observer.disconnect()},[])
 const plotTop=38; const plotBottom=viewHeight-52; const plotHeight=plotBottom-plotTop
 if(!data.some(item=>item.daily.length)){
  const history=data.history??[]
  const maxCount=Math.max(...history.map(point=>Math.max(point.total,point.paid)),1)
  const magnitude=10**Math.floor(Math.log10(maxCount)); const normalized=maxCount/magnitude; const yMax=(normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*magnitude; const tickStep=yMax<=5?1:yMax/5; const yTicks=Array.from({length:Math.round(yMax/tickStep)+1},(_,index)=>index*tickStep); const axisLabel=(value:number)=>value>=1000?`${number.format(value/1000)} mil`:number.format(value)
  const plotLeft=74; const plotRight=644
  const points=history.map((point,index)=>{const x=history.length===1?(plotLeft+plotRight)/2:plotLeft+index*(plotRight-plotLeft)/(history.length-1);return {point,x,totalY:plotBottom-point.total/yMax*plotHeight,paidY:plotBottom-point.paid/yMax*plotHeight}})
  const latest=points.at(-1)
  return <div className="trend">
<div className="chart-legend chart-history-legend">
<span className="legend-total">Inscritos totais</span><span className="legend-paid">Pagos sem treineiros</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Evolução histórica de inscritos totais e pagos">
<g className="chart-grid">{yTicks.map(value=>{const y=plotBottom-value/yMax*plotHeight;return <g key={value}><line x1={plotLeft} x2={plotRight} y1={y} y2={y}/><text className="chart-axis-label" x={plotLeft-10} y={y+3} textAnchor="end">{axisLabel(value)}</text></g>})}</g>
<line className="chart-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom}/>
<text className="chart-axis-title" transform={`rotate(-90 17 ${(plotTop+plotBottom)/2})`} x="17" y={(plotTop+plotBottom)/2} textAnchor="middle">Inscritos</text>
<polyline className="chart-line chart-total-line" points={points.map(({x,totalY})=>`${x},${totalY}`).join(' ')}/>
<polyline className="chart-line chart-paid-line" points={points.map(({x,paidY})=>`${x},${paidY}`).join(' ')}/>
{points.map(({point,x,totalY,paidY})=><g key={point.referenceAt}>
<circle className="chart-dot chart-total-dot" cx={x} cy={totalY} r="5"><title>{`${new Date(point.referenceAt).toLocaleString('pt-BR')}: ${number.format(point.total)} inscritos, ${number.format(point.paid)} pagos sem treineiros (${point.regular?Math.round(point.paid/point.regular*100):0}%), ${number.format(point.vacancies)} vagas e ${(point.vacancies?point.regular/point.vacancies:0).toFixed(2)}x de demanda`}</title></circle>
<circle className="chart-paid-dot" cx={x} cy={paidY} r="3"/>
<text className="chart-date" x={x} y={plotBottom+25} textAnchor="middle">{new Date(point.referenceAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>
</g>)}
{latest&&<><text className="chart-latest-value" x={latest.x} y={latest.totalY-13} textAnchor="middle">{number.format(latest.point.total)}</text><text className="chart-latest-paid" x={latest.x} y={latest.paidY+13} textAnchor="middle">{number.format(latest.point.paid)} pagos</text><text className="chart-latest-paid-rate" x={latest.x} y={latest.paidY+25} textAnchor="middle">{latest.point.regular?Math.round(latest.point.paid/latest.point.regular*100):0}%</text></>}
</svg>
<p className="chart-footnote chart-history-footnote"><span>{history.length} snapshot{history.length===1?'':'s'} real{history.length===1?' disponível':' disponíveis'}.</span>{latest&&<span>Último recorte: {number.format(latest.point.vacancies)} vagas · {(latest.point.vacancies?latest.point.regular/latest.point.vacancies:0).toFixed(1)}x de demanda.</span>}</p>
</div>
 }
 const points=Array.from({length:10},(_,index)=>({day:`Dia ${index+1}`,value:data.reduce((sum,item)=>sum+(item.daily[index]?.value??0),0)})); const max=Math.max(target,...points.map(point=>point.value),1); const pointList=points.map((point,index)=>`${72+index*65},${plotBottom-point.value/max*plotHeight}`).join(' '); const targetY=plotBottom-target/max*plotHeight
 return <div className="trend">
<div className="chart-legend">
<span className="legend-paid">Inscritos pagos</span>
<span className="legend-target">Meta prevista</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Evolucao diaria das inscricoes">
<g className="chart-grid">{[.1,.3,.5,.7,.9].map(ratio=>
<line key={ratio} x1="70" x2="650" y1={plotTop+plotHeight*ratio} y2={plotTop+plotHeight*ratio}/>)}</g>
<line className="chart-target" x1="70" x2="650" y1={targetY} y2={targetY}/>
<path className="chart-area" d={`M72 ${plotBottom} L${pointList.replaceAll(' ',' L')} L657 ${plotBottom} Z`}/>
<polyline className="chart-line" points={pointList}/>{points.map((point,index)=>
<g key={point.day}>
<circle className="chart-dot" cx={72+index*65} cy={plotBottom-point.value/max*plotHeight} r="3.4"/>
<text x={72+index*65} y={viewHeight-16} textAnchor="middle">{index+1}</text>
</g>)}</svg>
<p className="chart-footnote">Dados acumulados por dia de inscricao</p>
</div>
}
export default function App(){
 const [filters,setFilters]=useState<Filters>(initialFilters); const [analysisScope,setAnalysisScope]=useState<AnalysisScope>({presential:true,ead:false,trainees:false}); const [selectedEtec,setSelectedEtec]=useState(''); const [geographicScope,setGeographicScope]=useState<{label:string;etecs:string[]}|null>(null); const [mapResetKey,setMapResetKey]=useState(0); const [analysisTab,setAnalysisTab]=useState<'evolution'|'regional'>('evolution'); const [statusFilter,setStatusFilter]=useState<OfferStatus|null>(null); const [dashboard,setDashboard]=useState<DashboardPayload|null>(null); const [snapshotEndAt,setSnapshotEndAt]=useState(''); const [importOpen,setImportOpen]=useState(false); const [importPassword,setImportPassword]=useState(''); const [importFile,setImportFile]=useState<File|null>(null); const [importMessage,setImportMessage]=useState(''); const [importing,setImporting]=useState(false)
 useEffect(()=>{let cancelled=false;void fetch(apiUrl('/api/dashboard-data')).then(async response=>response.ok?readJson<{snapshots?:SnapshotSeries[];etecs?:EtecPoint[];sourceMetadata?:typeof staticSourceMetadata}>(response):null).then(payload=>{if(cancelled||!payload?.snapshots?.length)return;const snapshots=payload.snapshots;setDashboard({enrollments:snapshots.at(-1)!.enrollments,etecs:payload.etecs??[],snapshotSeries:snapshots,sourceMetadata:payload.sourceMetadata??staticSourceMetadata})}).catch(()=>{});return()=>{cancelled=true}},[])
 const {etecs,snapshotSeries,sourceMetadata}=dashboard??{etecs:staticEtecs,snapshotSeries:staticSnapshotSeries,sourceMetadata:staticSourceMetadata}; const rangeStartAt=snapshotSeries.at(0)?.referenceAt||''; const rangeEndAt=snapshotEndAt||snapshotSeries.at(-1)?.referenceAt||''; const visibleSnapshotSeries=snapshotSeries.filter(snapshot=>snapshot.referenceAt>=rangeStartAt&&snapshot.referenceAt<=rangeEndAt); const selectedSnapshot=visibleSnapshotSeries.at(-1)??snapshotSeries.at(-1); const enrollments=selectedSnapshot?.enrollments??staticEnrollments
 const isEadOffer=(item:Enrollment)=>/\s-\sEAD$/i.test(item.course)||normalizeName(item.period)==='on-line'; const matchesAnalysisScope=(item:Enrollment)=>item.isTrainee?analysisScope.trainees:isEadOffer(item)?analysisScope.ead:analysisScope.presential
 const etecByName=new Map(etecs.map(etec=>[etec.name,etec])); const regionalByEtec=new Map(etecs.map(etec=>{const municipality=normalizeName(etec.municipality);return [etec.name,mapRegionalByMunicipality.get(municipality)??mapRegionalFallbackByMunicipality.get(municipality)]})); const regionalFor=(item:Enrollment)=>regionalByEtec.get(item.etec)??item.regional; const cityFor=(item:Enrollment)=>etecByName.get(item.etec)?.municipality??''; const dependentKeys:FilterKey[]=['regional','city','etec','modality','course','period']; const matchesFilters=(item:Enrollment,current:Filters,ignored?:FilterKey)=>dependentKeys.every(candidate=>candidate===ignored||!current[candidate].length||(candidate==='regional'?current.regional.includes(regionalFor(item)):candidate==='city'?current.city.includes(cityFor(item)):current[candidate].includes(item[candidate]))); const valuesFor=(key:FilterKey,current:Filters,scope=geographicScope)=>{const items=enrollments.filter(item=>(!scope||scope.etecs.includes(item.etec))&&matchesFilters(item,current,key)); const validItems=(key==='course'||key==='period')?items.filter(item=>!item.isTrainee):items; return [...new Set(validItems.map(item=>key==='regional'?regionalFor(item):key==='city'?cityFor(item):item[key]))].sort()}; const mapRegionalOptions=REGIONAIS.features.map(feature=>String(feature.properties.regional??'')).filter(regional=>enrollments.some(item=>regionalFor(item)===regional)); const normalizeFilters=(next:Filters,preserve?:FilterKey,scope=geographicScope)=>{let normalized=next; let changed=true; while(changed){changed=false; dependentKeys.forEach(key=>{const values=key==='regional'?mapRegionalOptions:valuesFor(key,normalized,scope);const nextValues=key===preserve?normalized[key]:normalized[key].filter(value=>values.includes(value));if(nextValues.length!==normalized[key].length){normalized={...normalized,[key]:nextValues};changed=true}})} return normalized}; const options={regional:mapRegionalOptions,city:valuesFor('city',filters),etec:valuesFor('etec',filters),modality:staticOptions.modality,course:valuesFor('course',filters),period:valuesFor('period',filters)}
 const updateFilter=(key:FilterKey,value:string[])=>{setGeographicScope(null);setFilters(current=>normalizeFilters({...current,[key]:value},key,null));setMapResetKey(current=>current+1);setSelectedEtec(key==='etec'&&value.length===1?value[0]:'')}; const selectEtec=(etec:string)=>{const scope={label:etec,etecs:[etec]};const city=etecByName.get(etec)?.municipality??'';setSelectedEtec(etec);setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,city:city?[city]:[],etec:[etec]},'etec',scope))}; const selectGeographicScope=(label:string,scopedEtecs:string[])=>{const scope={label,etecs:scopedEtecs};const scopedCities=[...new Set(scopedEtecs.map(etec=>etecByName.get(etec)?.municipality).filter((city):city is string=>Boolean(city)))];const city=scopedCities.length===1?scopedCities[0]:'';setSelectedEtec('');setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,city:city?[city]:[],etec:[]},city?'city':undefined,scope))}; const clearGeographicScope=()=>{setSelectedEtec('');setGeographicScope(null);setFilters(current=>normalizeFilters({...current,city:[],etec:[]},undefined,null))}; const clearFilters=()=>{setSelectedEtec('');setGeographicScope(null);setStatusFilter(null);setFilters(initialFilters);setMapResetKey(current=>current+1)}
 const uploadImport=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!importFile||!importPassword){setImportMessage('Informe a senha e selecione a planilha para continuar.');return}setImporting(true);setImportMessage('Validando e importando a planilha...');try{const response=await fetch(apiUrl('/api/import-inscricoes'),{method:'POST',headers:{'X-Import-Password':importPassword,'Content-Type':importFile.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-File-Name':encodeURIComponent(importFile.name)},body:importFile});const payload=await readJson<{error?:string;records?:number}>(response);if(!response.ok)throw new Error(payload.error??'Não foi possível importar a planilha.');setImportPassword('');setImportMessage(`Importação publicada com ${number.format(payload.records??0)} ofertas. Atualizando o painel...`);window.setTimeout(()=>window.location.reload(),900)}catch(error){setImportMessage(error instanceof Error?error.message:'Não foi possível importar a planilha.')}finally{setImporting(false)}}
 const matchesActiveScope=(item:Enrollment)=>matchesAnalysisScope(item)&&matchesFilters(item,filters)&&(!geographicScope||geographicScope.etecs.includes(item.etec))&&(!statusFilter||(!item.isTrainee&&item.vacancies>0&&offerStatusFor(item)===statusFilter)); const scopedHistory=visibleSnapshotSeries.map(({referenceAt,enrollments:items})=>{const scoped=items.filter(matchesActiveScope);const regular=scoped.filter(item=>!item.isTrainee);const paid=regular.reduce((sum,item)=>sum+item.paid,0);const unpaid=regular.reduce((sum,item)=>sum+item.unpaid,0);const trainee=scoped.filter(item=>item.isTrainee).reduce((sum,item)=>sum+item.paid+item.unpaid,0);const vacancies=regular.reduce((sum,item)=>sum+item.vacancies,0);return {referenceAt,total:paid+unpaid+trainee,paid,unpaid,trainee,regular:paid+unpaid,vacancies}}); const data=Object.assign(enrollments.filter(matchesActiveScope),{history:scopedHistory}) as ChartData; const totals=data.reduce((r,item)=>({paid:r.paid+(item.isTrainee?0:item.paid),unpaid:r.unpaid+(item.isTrainee?0:item.unpaid),vacancies:r.vacancies+(item.isTrainee?0:item.vacancies),target:r.target+item.target,trainee:r.trainee+(item.isTrainee?item.paid+item.unpaid:0),regular:r.regular+(item.isTrainee?0:item.paid+item.unpaid)}),{paid:0,unpaid:0,vacancies:0,target:0,trainee:0,regular:0}); const total=totals.paid+totals.unpaid+totals.trainee
 const demandBands=data.filter(item=>!item.isTrainee&&item.vacancies>0).reduce((r,item)=>{const demand=(item.paid+item.unpaid)/item.vacancies;if(demand>=1.5)r.comfortable++;else if(demand>=1)r.attention++;else r.low++;return r},{comfortable:0,attention:0,low:0})
 const regularOfferCount=demandBands.comfortable+demandBands.attention+demandBands.low
 const activeEtecNames=new Set(data.map(item=>item.etec)); const activeEtecs=etecs.filter(etec=>activeEtecNames.has(etec.name)); const selectedEtecLabel=etecs.find(etec=>etec.name===selectedEtec)?.label??selectedEtec
 const scope=selectedEtec?selectedEtecLabel:(geographicScope?.label??'Estado de Sao Paulo')
 const geographicScopeIsMunicipality=Boolean(geographicScope?.etecs.every(name=>etecs.find(etec=>etec.name===name)?.municipality===geographicScope.label))
 const performanceTable=selectedEtec?{title:'Desempenho do local de oferta',column:'Local de oferta',label:selectedEtecLabel,countLabel:'local'}:geographicScopeIsMunicipality?{title:'Desempenho do município',column:'Município',label:geographicScope!.label,countLabel:'município'}:(filters.regional.length||geographicScope)?{title:'Desempenho da regional',column:'Regional',label:'',countLabel:'regional'}:{title:'Desempenho por regional',column:'Regional',label:'',countLabel:'regionais'}
 const activeModes=[analysisScope.presential&&{single:'presenciais',combined:'presencial'},analysisScope.trainees&&{single:'treineiros',combined:'treineiros'},analysisScope.ead&&{single:'EAD',combined:'EAD'}].filter((mode):mode is {single:string;combined:string}=>Boolean(mode))
 const enrollmentTitle=activeModes.length===1?`Inscrições ${activeModes[0].single}`:activeModes.length?`Inscrições ${activeModes.map(mode=>mode.combined).join(' + ')}`:'Inscrições no recorte'
 const demandRatio=totals.vacancies?totals.regular/totals.vacancies:null
 const kpis=[['Inscritos totais',number.format(total),`${number.format(totals.trainee)} Treineiros incluidos`,'blue'],['Inscritos pagos',number.format(totals.paid),`${total?Math.round(totals.paid/total*100):0}% do total`,'green'],['Inscritos isentos',exemptionMetrics?number.format(exemptionMetrics.inscritos_com_isencao):'N/D','fonte de isenção indisponível','purple'],['Conversao',`${total?Math.round(totals.paid/total*100):0}%`,'Pagos / totais','amber'],['Vagas oferecidas',number.format(totals.vacancies),'somente ofertas regulares','cyan'],['Demanda efetiva',demandRatio===null?'N/A':`${demandRatio.toFixed(1)}x`,'somente inscritos regulares','orange']]
 const describeSelected=(label:string,values:string[],format=(value:string)=>value)=>values.length?`${label}: ${values.length===1?format(values[0]):`${values.length} selecionados`}`:''; const geographicSummary=selectedEtec?`Local de oferta: ${selectedEtecLabel}`:geographicScope?`${geographicScopeIsMunicipality?'Município':'Regional'}: ${geographicScope.label}`:''; const scopeSummary=[geographicSummary,describeSelected('Regional',filters.regional),describeSelected('Cidade',filters.city),!selectedEtec?describeSelected('Local de oferta',filters.etec,value=>etecByName.get(value)?.label??value):'',describeSelected('Modalidade',filters.modality),describeSelected('Curso',filters.course),describeSelected('Período',filters.period)].filter(Boolean).join(' • ')||scope.replace('Sao','São')
 void kpis
 const visible=activeEtecs.map(etec=>etec.name); const regionalRows=options.regional.map(regional=>{const items=data.filter(item=>regionalFor(item)===regional);const regularItems=items.filter(item=>!item.isTrainee);const value=items.reduce((sum,item)=>sum+item.paid+item.unpaid,0);const regularValue=regularItems.reduce((sum,item)=>sum+item.paid+item.unpaid,0);const paid=regularItems.reduce((sum,item)=>sum+item.paid,0);const vacancies=regularItems.reduce((sum,item)=>sum+item.vacancies,0);const offersWithVacancies=regularItems.filter(item=>item.vacancies>0);const lowDemand=offersWithVacancies.filter(item=>(item.paid+item.unpaid)/item.vacancies<1).length;return {regional,value,regularValue,paid,vacancies,lowDemand,regularOfferCount:offersWithVacancies.length}}).filter(row=>row.value>0); const offerStatus=[['Demanda confortável',demandBands.comfortable,'demand-comfortable'],['Atenção',demandBands.attention,'demand-attention'],['Baixa demanda',demandBands.low,'demand-low']] as const
 return <div className="app-shell">
<header className="institutional-header">
<div className="brand">
<div>
<h1>{sourceMetadata.edicao.toUpperCase()}</h1>
<p>Acompanhamento das Inscricoes</p>
</div>
</div>
<div className="header-meta">
<div className="analysis-scope" role="group" aria-label="Recorte">
<span className="analysis-scope-title">Recorte</span>
<div className="analysis-scope-options">{([['presential','Presencial'],['ead','EAD'],['trainees','Treineiros']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={analysisScope[key]} onChange={event=>setAnalysisScope(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}</div>
</div>
<label className="snapshot-filter">
<span>Dados até</span>
<select value={rangeEndAt} onChange={event=>setSnapshotEndAt(event.target.value)} aria-label="Dados até">
{snapshotSeries.map(snapshot=><option key={snapshot.referenceAt} value={snapshot.referenceAt}>{formatSnapshotDate(snapshot.referenceAt)}</option>)}
</select>
</label>
<button type="button" onClick={()=>{setImportMessage('');setImportOpen(true)}}>Importar planilha</button>
</div>
</header>
<main className="content">
<section className="filter-card">
<div className="filter-bar">
<SelectFilter label="Regional" value={filters.regional} values={options.regional} onChange={value=>updateFilter('regional',value)}/>
<SelectFilter label="Cidade" value={filters.city} values={options.city} onChange={value=>updateFilter('city',value)}/>
<SelectFilter label="Etec" value={filters.etec} values={options.etec} onChange={value=>updateFilter('etec',value)} etecOptions={etecs}/>
<SelectFilter label="Modalidade" value={filters.modality} values={options.modality} onChange={value=>updateFilter('modality',value)}/>
<SelectFilter label="Eixo tecnológico" value={[]} values={[]} onChange={()=>{}}/>
<SelectFilter label="Curso" value={filters.course} values={options.course} onChange={value=>updateFilter('course',value)}/>
<SelectFilter label="Periodo" value={filters.period} values={options.period} onChange={value=>updateFilter('period',value)}/>
<button className="clear-button" type="button" onClick={clearFilters}>Limpar filtros</button>
</div>
</section>
<section className="scope-row">
<div>
<span>VISUALIZANDO</span>
<strong>{scopeSummary}</strong>
</div>{(selectedEtec||geographicScope)&&<button className="selection-clear" type="button" onClick={clearFilters}>Limpar selecao</button>}</section>
<section className="dashboard-top">
<section className="kpi-row consolidated-kpis">
<article className="kpi-card enrollment-kpi">
<div className="enrollment-copy">
<p>{enrollmentTitle}</p>
<strong>{number.format(total)}</strong>
<div className="enrollment-progress" role="progressbar" aria-label={`Inscrições: ${number.format(totals.paid)} pagos regulares, ${number.format(totals.unpaid)} não pagos regulares e ${number.format(totals.trainee)} treineiros`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total?Math.round(totals.paid/total*100):0}>
<i className="enrollment-progress-paid" style={{width:`${total?totals.paid/total*100:0}%`}}/>
<i className="enrollment-progress-unpaid" style={{width:`${total?totals.unpaid/total*100:0}%`}}/>
<i className="enrollment-progress-trainee" style={{width:`${total?totals.trainee/total*100:0}%`}}/>
</div>
<div className={`enrollment-metrics${activeModes.length>1?' with-breakdown':''}`}>
<span className="enrollment-metric paid">{number.format(totals.paid)} pagos{activeModes.length>0&&` (${total?Math.round(totals.paid/total*100):0}%)`}</span>
<span className="enrollment-metric unpaid">{number.format(totals.unpaid)} não pagos{activeModes.length>0&&` (${total?Math.round(totals.unpaid/total*100):0}%)`}</span>
{analysisScope.trainees&&<span className="enrollment-metric trainee">{number.format(totals.trainee)} treineiros{activeModes.length>0&&` (${total?Math.round(totals.trainee/total*100):0}%)`}</span>}
</div>
</div>
</article>
<article className="kpi-card demand-kpi">
<div className="demand-copy"><p>Vagas e demanda</p><div className="demand-values"><strong>{number.format(totals.vacancies)}</strong><small>vagas disponíveis</small></div><small>{number.format(totals.regular)} inscritos regulares</small></div>
<div className="demand-badge" aria-label={demandRatio===null?'Demanda não aplicável: não há vagas no recorte':`${demandRatio.toFixed(1)} candidatos por vaga`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 1 0 7.75"/></svg><div><strong>{demandRatio===null?'N/A':`${demandRatio.toFixed(1)}x`}</strong><span>{demandRatio===null?'sem vagas no recorte':'candidato/vaga'}</span></div></div>
</article>
<article className="kpi-card offer-status-kpi">
<div className="kpi-status-heading">
<p>Situação das ofertas</p>
<small>{number.format(regularOfferCount)} turmas</small>
</div>
<div className="status-list">{offerStatus.map(([label,value,tone],index)=>{const percentage=regularOfferCount?value/regularOfferCount*100:0;const roundedPercentage=Math.round(percentage);return <button type="button" key={label} className={`${tone}${statusFilter===(['comfortable','attention','low'] as OfferStatus[])[index]?' active':''}`} onClick={()=>{const next=(['comfortable','attention','low'] as OfferStatus[])[index];setStatusFilter(current=>current===next?null:next)}}>
<div className="status-value"><strong data-label={label}>{number.format(value)}</strong></div>
<div className="status-progress" role="progressbar" aria-label={`${label}: ${roundedPercentage}% das ofertas`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedPercentage}><i style={{width:`${percentage}%`}}/><span className="status-progress-label" style={{left:`${percentage/2}%`}}>{roundedPercentage}%</span></div>
</button>})}</div>
</article>
</section>
<div className="primary-panels">
<article className="panel map-panel">
<div className="panel-header">
<h2>Distribuicao geografica das inscricoes pagas</h2>
<span>{visible.length} locais</span>
</div>
<D3GeographicMap etecs={etecs} selected={selectedEtec} visible={visible} focusedRegional={filters.regional.length===1?filters.regional[0]:''} resetKey={mapResetKey} onSelect={selectEtec} onGeographicSelect={selectGeographicScope} onGeographicClear={clearGeographicScope}/>
<p className="panel-note">Navegue pelas regionais e municípios, ou clique em um local para filtrar o painel.</p>
</article>
<article className="panel evolution-panel">
<div className="panel-header">
<h2>Acompanhamento das inscricoes</h2>
</div>
<div className="analysis-tabs" role="tablist" aria-label="Análises">
<button type="button" role="tab" aria-selected={analysisTab==='evolution'} className={analysisTab==='evolution'?'active':''} onClick={()=>setAnalysisTab('evolution')}>Evolução</button>
<button type="button" role="tab" aria-selected={analysisTab==='regional'} className={analysisTab==='regional'?'active':''} onClick={()=>setAnalysisTab('regional')}>Desempenho por Regional</button>
</div>
{analysisTab==='evolution'?<TrendChart data={data} target={totals.target}/>:<div className="regional-table analysis-regional-table">
<div className="regional-head">
<span>{performanceTable.column}</span>
<span>Inscritos</span>
<span>Pagos</span>
<span>Conversao</span>
<span>Demanda</span>
<span>Baixa demanda</span>
</div>{regionalRows.map(row=>
<div className="regional-line" key={row.regional}>
<strong>{performanceTable.label||row.regional}</strong>
<span>{number.format(row.value)}</span>
<span>{number.format(row.paid)}</span>
<span>{row.value?`${Math.round(row.paid/row.value*100)}%`:'0%'}</span>
<span>{row.vacancies?`${(row.regularValue/row.vacancies).toFixed(1)}x`:'N/A'}</span>
<span>{number.format(row.lowDemand)} · {row.regularOfferCount?`${(row.lowDemand/row.regularOfferCount*100).toFixed(1).replace('.',',')}%`:'0,0%'}</span>
</div>)}<div className="regional-total">
<strong>Total geral</strong>
<span>{number.format(total)}</span>
<span>{number.format(totals.paid)}</span>
<span>{total?`${Math.round(totals.paid/total*100)}%`:'0%'}</span>
<span>{totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'N/A'}</span>
<span>{number.format(demandBands.low)} · {regularOfferCount?`${(demandBands.low/regularOfferCount*100).toFixed(1).replace('.',',')}%`:'0,0%'}</span>
</div>
</div>}
</article>
</div>
</section>
</main>
{importOpen&&<div className="import-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="import-close" type="button" aria-label="Fechar" onClick={()=>setImportOpen(false)}>×</button><p className="import-eyebrow">Atualização de dados</p><h2 id="import-title">Importar planilha</h2><p className="import-copy">Informe a senha de importação e selecione a exportação do Vestibulinho. A versão anterior continuará disponível até esta planilha ser validada e publicada.</p><form onSubmit={uploadImport}><label className="import-email">Senha de importação<input type="password" value={importPassword} onChange={event=>setImportPassword(event.target.value)} autoComplete="current-password" required/></label><label className="import-file">Arquivo .xls ou .xlsx<input type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setImportFile(event.target.files?.[0]??null)}/><span>{importFile?.name??'Selecionar exportação do Vestibulinho'}</span></label><button className="import-submit" type="submit" disabled={importing}>{importing?'Importando...':'Validar e publicar'}</button></form><p className="import-message" role="status">{importMessage}</p></section></div>}
<footer className="dashboard-footer">Correções e atualizações: rafael.ruiz@cps.sp.gov.br · CGTEC — ASCA
</footer>
</div>
}
