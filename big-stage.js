(() => {
  const SEASON = "2027";
  const STAGE_CAP = 12;
  const state = { section: "shows", view: "board", boardTeacher: "", activeRecital: "A", recitalTeacherShows: {A:{},B:{},C:{},D:{}}, recitalLocks: {A:{},B:{},C:{},D:{}}, fullscreen: false, loading: false, groups: [], classes: [], persisted: false, showPlan: null, notice: "", saveStatus: "", productionShow: "", draggedClass: "", draggedClasses: [], draggedSchool: "", draggedShow: 0, draggedByShowHandle: false, pendingShows: {}, schoolShows: {}, showColors: { 1:"#dba9a1", 2:"#b8c8aa", 3:"#e3bd74", 4:"#aebfd3" }, filters: { teacher: "", school: "", requirement: "" }, history: [] };
  const productionShows = [];
  const root = () => document.getElementById("big-stage-app");
  let syncingDancerDetails = false;
  const plannerSnapshot = () => ({groups:JSON.parse(JSON.stringify(state.groups)),schoolShows:{...state.schoolShows},pendingShows:{...state.pendingShows},showColors:{...state.showColors},activeRecital:state.activeRecital,recitalTeacherShows:JSON.parse(JSON.stringify(state.recitalTeacherShows)),recitalLocks:JSON.parse(JSON.stringify(state.recitalLocks)),showPlan:state.showPlan?{classShow:{...state.showPlan.classShow},shows:state.showPlan.shows.map((show)=>({...show,schools:[...show.schools],teachers:[...show.teachers]}))}:null});
  const rememberPlannerState = () => {state.saveStatus="";state.history.push(plannerSnapshot());if(state.history.length>30)state.history.shift();};
  const undoPlannerState = () => {const prior=state.history.pop();if(!prior)return false;state.groups=prior.groups;state.schoolShows=prior.schoolShows;state.pendingShows=prior.pendingShows;state.showColors=prior.showColors;state.activeRecital=prior.activeRecital||"A";state.recitalTeacherShows=prior.recitalTeacherShows||{A:{},B:{},C:{},D:{}};state.recitalLocks=prior.recitalLocks||{A:{},B:{},C:{},D:{}};state.showPlan=prior.showPlan?{classShow:prior.showPlan.classShow,shows:prior.showPlan.shows.map((show)=>({...show,schools:new Set(show.schools),teachers:new Set(show.teachers)}))}:null;state.notice="Last planning change undone.";return true;};
  const workspaceStorageKey = `dt-recital-planner-workspace:${SEASON}`;
  const workspaceGroupSnapshot = (group) => ({id:group.id,name:group.name,requirement:group.requirement,relationship:group.relationship,quality:group.quality,decision:group.decision,owner:group.owner,teacherIds:group.teacherIds,crossTeacher:Boolean(group.crossTeacher),emptyForTeacher:group.emptyForTeacher||"",classIds:group.classes.map((item)=>item.id),stageSets:group.stageSets.map((set)=>set.map((item)=>item.id)),analysis:group.analysis||{},songId:group.songId||"",songTitle:group.songTitle||"",showAssignments:group.showAssignments||{},teacherShows:group.teacherShows||[],showsLinked:Boolean(group.showsLinked),resultingShowUses:group.resultingShowUses||0,sourceRoutineUses:group.sourceRoutineUses||[],targetFourPriority:group.targetFourPriority||0});
  const plannerWorkspaceSnapshot = () => ({groups:state.groups.map(workspaceGroupSnapshot),schoolShows:{...state.schoolShows},pendingShows:{...state.pendingShows},showColors:{...state.showColors},classShow:{...(state.showPlan?.classShow||{})},boardTeacher:state.boardTeacher,activeRecital:state.activeRecital,recitalTeacherShows:state.recitalTeacherShows,recitalLocks:state.recitalLocks});
  const hydrateWorkspaceGroups = (savedGroups) => (savedGroups||[]).map((saved)=>{const classes=(saved.classIds||[]).map((id)=>state.classes.find((item)=>item.id===id)).filter(Boolean),stageSets=(saved.stageSets||[]).map((set)=>(set||[]).map((id)=>state.classes.find((item)=>item.id===id)).filter(Boolean)).filter((set)=>set.length);if(!classes.length&&!saved.emptyForTeacher)return null;return {...saved,classes,stageSets,teacherIds:[...new Set(classes.map((item)=>item.teacherId).concat(saved.emptyForTeacher||[]))],analysis:saved.analysis||{},showAssignments:saved.showAssignments||{}};}).filter(Boolean);
  const loadPlannerWorkspace = async () => {let saved=null;if(document.body.dataset.tourMode!=="true"&&window.dtSupabase){const result=await window.dtSupabase.from("recital_planner_workspace_states").select("workspace_state").eq("season",SEASON).maybeSingle();if(!result.error)saved=result.data?.workspace_state||null;}if(!saved){try{saved=JSON.parse(localStorage.getItem(workspaceStorageKey)||"null");}catch{saved=null;}}if(!saved)return null;state.schoolShows={...(saved.schoolShows||{})};state.pendingShows={...(saved.pendingShows||{})};state.showColors={...state.showColors,...(saved.showColors||{})};state.boardTeacher=saved.boardTeacher||state.boardTeacher;state.activeRecital=saved.activeRecital||"A";state.recitalTeacherShows={A:{},B:{},C:{},D:{},...(saved.recitalTeacherShows||{})};state.recitalLocks={A:{},B:{},C:{},D:{},...(saved.recitalLocks||{})};state.showPlan={classShow:{...(saved.classShow||{})},shows:[]};return hydrateWorkspaceGroups(saved.groups);};
  const savePlannerWorkspace = async () => {const workspace=plannerWorkspaceSnapshot();try{localStorage.setItem(workspaceStorageKey,JSON.stringify(workspace));}catch{}if(document.body.dataset.tourMode==="true"||!window.dtSupabase)return true;const result=await window.dtSupabase.from("recital_planner_workspace_states").upsert({season:SEASON,workspace_state:workspace,updated_by:window.dtCurrentProfile?.id||null,updated_at:new Date().toISOString()});return !result.error;};
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
  const title = (value) => String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());
  const ageLabel = (months) => {
    const total = Math.max(0, Math.round(Number(months) || 0));
    return `${Math.floor(total / 12)}Y ${total % 12}M`;
  };
  const activeRosterClasses = () => typeof rosterClasses === "undefined" ? [] : rosterClasses.filter((item) => item.sourceActive !== false && String(item.teacherId || "").trim());
  const teacherName = (id) => typeof rosterTeacherName === "function" ? rosterTeacherName(id) : "Teacher";
  const teacherColor = (name) => typeof messageAssignedColor === "function" ? messageAssignedColor(name, "Teacher") : "#dba9a1";
  const enrolled = (item) => (item.students || []).filter((student) => student.status === "enrolled");
  const fullName = (student) => [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ").trim();
  const boardDancerName = (student) => `${student.preferredName || student.firstName || "Dancer"}${student.lastName ? ` ${String(student.lastName).trim().charAt(0)}.` : ""}`;
  const boardDancerInitials = (student) => [student.preferredName || student.firstName,student.lastName].filter(Boolean).map((part)=>String(part).trim().charAt(0)).join("").slice(0,2).toUpperCase() || "DT";
  const schoolKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasSchoolConflict = (classes) => {
    const schools = classes.map((item) => schoolKey(item.school)).filter(Boolean);
    return new Set(schools).size !== schools.length;
  };
  const monthsOld = (birthdate) => {
    if (!birthdate) return null;
    const born = new Date(`${birthdate}T12:00:00`);
    if (Number.isNaN(born.valueOf())) return null;
    const today = new Date();
    return (today.getFullYear() - born.getFullYear()) * 12 + today.getMonth() - born.getMonth() - (today.getDate() < born.getDate() ? 1 : 0);
  };
  const requirementFor = (item) => {
    const saved=String(item.recitalPerformance||item.recital_performance||"").toLowerCase();
    if(["ballet","tap"].includes(saved))return saved;
    const needs=enrolled(item).reduce((counts,student)=>{const prior=String(student.requestedDanceStyle||student.requested_dance_style||"").trim().toLowerCase();if(prior==="tap")counts.ballet+=1;else if(prior==="ballet")counts.tap+=1;return counts;},{ballet:0,tap:0});
    if(needs.ballet>needs.tap)return "ballet";
    if(needs.tap>needs.ballet)return "tap";
    return "either";
  };
  const classRecord = (item) => {
    const students = enrolled(item);
    const ages = students.map((student) => monthsOld(student.birthdate)).filter(Number.isFinite).sort((a,b) => a-b);
    const related = students.flatMap((student) => String(student.relatedDancerName || "").split(" • ").map((name) => name.trim()).filter(Boolean));
    return {
      id: String(item.id), sourceClassId:String(item.sourceClassId||item.id), recitalGroupId:String(item.recitalGroupId||""), source: item, name: item.name || "Class", school: item.schoolName || "School",
      teacherId: String(item.teacherId || ""), teacher: teacherName(item.teacherId), teacherColor: teacherColor(teacherName(item.teacherId)), requirement: requirementFor(item),
      level: Number(item.level || 1), count: students.length, students, related,
      minAge: ages[0] ?? null, maxAge: ages.at(-1) ?? null, avgAge: ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null,
      ageData: ages.length, day: item.day || "", time: item.time || ""
    };
  };
  const planningClassRecords = (item) => {
    const groups=typeof window.getSharedRecitalPerformanceGroups==="function"?window.getSharedRecitalPerformanceGroups(item.id):[];
    if(groups.length<=1)return [classRecord(item)];
    return groups.map((group,index)=>{const letter=String.fromCharCode(64+(Number(group.position)||index+1)),nickname=String(group.name||`Group ${letter}`).replace(new RegExp(`^${letter}\\s*[·.:-]?\\s*`,"i"),"").trim()||`Group ${letter}`,savedRequirement=["ballet","tap"].includes(String(group.requirement||"").toLowerCase())?group.requirement:"";return classRecord({...item,id:`${item.id}::recital-group::${group.id}`,sourceClassId:String(item.id),recitalGroupId:group.id,name:`${item.name} - ${letter} - ${nickname}`,recitalPerformance:savedRequirement,students:group.students});});
  };
  const tourBirthdateForMonths = (months, offset = 0) => {
    const date = new Date();
    date.setDate(15 - (offset % 9));
    date.setMonth(date.getMonth() - months);
    return date.toISOString().slice(0,10);
  };
  const tourPlanningClasses = () => {
    const teachers = [
      { id:"tour-lexi", name:"Ms. Lexi", schools:["Primrose Rockwall","Primrose North Rockwall","Primrose Rowlett","Highview Learning Center"], classes:[["Tots",7,20,31,"either"],["2s",5,25,35,"tap"],["Preschool",9,36,47,"ballet"],["Pre-K",8,48,59,"either"]] },
      { id:"tour-taylor", name:"Ms. Taylor", schools:["Celebree Plano Los Rios","Children's Lighthouse Rockwall","Kids Unlimited"], classes:[["Tots",4,19,29,"ballet"],["Young 2s",6,25,34,"either"],["Preschool",8,37,48,"tap"]] },
      { id:"tour-tiffany", name:"Ms. Tiffany", schools:["Children's Lighthouse Fate","Cotton Mill Rowlett","Primrose Wylie"], classes:[["2s",3,25,36,"either"],["Preschool",10,37,49,"ballet"],["Pre-K",7,49,60,"tap"]] },
      { id:"tour-erika", name:"Ms. Erika", schools:["Kiddie Academy Murphy","Oakhill Day School"], classes:[["Tots",5,18,28,"tap"],["2s",4,26,36,"either"],["Preschool",6,38,50,"ballet"]] }
    ];
    let sequence=0;
    return teachers.flatMap((teacher)=>teacher.schools.flatMap((school,schoolIndex)=>teacher.classes
      .filter((_,classIndex)=>teacher.id!=="tour-lexi"||schoolIndex<3||classIndex<2)
      .map(([name,count,minAge,maxAge,requirement],classIndex)=>{
        sequence+=1;
        const ages=Array.from({length:count},(_,studentIndex)=>Math.round(minAge+((maxAge-minAge)*studentIndex/Math.max(1,count-1))));
        const students=ages.map((age,studentIndex)=>({id:`tour-student-${sequence}-${studentIndex}`,firstName:`Dancer ${studentIndex+1}`,lastName:school.split(" ")[0],birthdate:tourBirthdateForMonths(age,studentIndex),status:"enrolled",relatedDancerName:""}));
        return {id:`tour-class-${sequence}`,source:{},name,school,teacherId:teacher.id,teacher:teacher.name,teacherColor:teacherColor(teacher.name),requirement,level:classIndex+1,count,students,related:[],minAge,maxAge,avgAge:ages.reduce((sum,age)=>sum+age,0)/ages.length,ageData:ages.length,day:["Monday","Tuesday","Wednesday","Thursday"][schoolIndex%4],time:`${15+classIndex}:30`};
      })));
  };
  const tourPlannerClasses = () => {
    const examples=tourPlanningClasses(),teacherIds=new Map(examples.map((item)=>[String(item.teacher||"").trim().toLowerCase(),item.teacherId]));
    const additions=activeRosterClasses().filter((item)=>String(item.id||"").startsWith("roster-")).flatMap(planningClassRecords).map((item)=>{const teacherId=teacherIds.get(String(item.teacher||"").trim().toLowerCase());return teacherId?{...item,teacherId}:item;});
    return [...examples,...additions.filter((item)=>!examples.some((example)=>example.id===item.id))];
  };
  const ageSpread = (classes) => {
    const ages = classes.flatMap((item) => item.students.map((student) => monthsOld(student.birthdate)).filter(Number.isFinite));
    return ages.length ? Math.max(...ages) - Math.min(...ages) : null;
  };
  const compatibleRequirement = (a,b) => a === b || a === "either" || b === "either";
  const pairScore = (a,b, cross = false) => {
    if (schoolKey(a.school) === schoolKey(b.school)) return -100;
    if (!compatibleRequirement(a.requirement,b.requirement)) return -100;
    const spread = ageSpread([a,b]);
    const levelGap = Math.abs(a.level-b.level);
    let score = 45 + (a.requirement === b.requirement ? 18 : 7) + (a.teacherId === b.teacherId ? 18 : -8);
    if (spread == null) score += 4; else if (spread <= 12) score += 24; else if (spread <= 18) score += 12; else if (spread <= 24) score += 2; else score -= 35;
    score += levelGap === 0 ? 12 : levelGap === 1 ? 4 : -18;
    if (cross && Math.max(a.maxAge || 999,b.maxAge || 999) > 42) score -= 45;
    return score;
  };
  const groupScore = (group, candidate) => Math.min(...group.classes.map((item) => pairScore(item,candidate))) + Math.min(group.classes.length,3) * 3;
  const bestCombineSets = (classes) => {
    const remaining = [...classes].sort((a,b) => a.count-b.count);
    const sets = [];
    while (remaining.length) {
      let best = [];
      const limit = 1 << Math.min(remaining.length, 12);
      for (let mask=1; mask<limit; mask+=1) {
        const subset = remaining.filter((_,index) => mask & (1<<index));
        const total = subset.reduce((sum,item)=>sum+item.count,0);
        if (total > STAGE_CAP) continue;
        if (hasSchoolConflict(subset)) continue;
        const spread = ageSpread(subset);
        if (spread != null && spread > 18) continue;
        if (subset.length > best.length || (subset.length === best.length && total > best.reduce((sum,item)=>sum+item.count,0))) best = subset;
      }
      if (!best.length) best = [remaining[0]];
      sets.push(best);
      best.forEach((item) => remaining.splice(remaining.indexOf(item),1));
    }
    return sets;
  };
  const qualityFor = (classes) => {
    const spread = ageSpread(classes);
    const score = classes.length < 2 ? 0 : Math.min(...classes.slice(1).map((item) => pairScore(classes[0],item)));
    return score >= 88 && (spread == null || spread <= 12) ? "strong" : score >= 68 ? "good" : "possible";
  };
  const analysisFor = (classes, crossTeacher = false) => {
    const spread = ageSpread(classes);
    const teachers = [...new Set(classes.map((item)=>item.teacher))];
    const total = classes.reduce((sum,item)=>sum+item.count,0);
    return {
      dancerTotal: total, ageSpread: spread, teachers,
      reasons: [
        teachers.length === 1 ? "Same teacher" : `${teachers.length} teachers involved`,
        spread == null ? "Some birthdates still needed" : `All known ages span ${spread} month${spread===1?"":"s"}`,
        `Compatible ${classes[0]?.requirement || "recital"} requirement`,
        total <= STAGE_CAP ? `${total} dancers fits the 12-dancer stage cap` : `${total} dancers requires separate stage groups`,
        crossTeacher ? "Young-class choreography can be standardized" : "Reduces unique choreography"
      ]
    };
  };
  const generatedGroups = (classes) => {
    const groups = [];
    const byTeacher = new Map();
    classes.forEach((item) => { if (!byTeacher.has(item.teacherId)) byTeacher.set(item.teacherId,[]); byTeacher.get(item.teacherId).push(item); });
    byTeacher.forEach((teacherClasses) => {
      teacherClasses.sort((a,b)=>(a.avgAge??999)-(b.avgAge??999)||a.requirement.localeCompare(b.requirement));
      teacherClasses.forEach((candidate) => {
        const options = groups.filter((group)=>!group.crossTeacher && group.teacherIds[0]===candidate.teacherId && compatibleRequirement(group.requirement,candidate.requirement));
        const best = options.map((group)=>({group,score:groupScore(group,candidate)})).sort((a,b)=>b.score-a.score)[0];
        if (best && best.score >= 57) best.group.classes.push(candidate);
        else groups.push({ id:crypto.randomUUID(), name:"", requirement:candidate.requirement, relationship:"separate", quality:"possible", decision:"suggested", owner:"lead_teacher", teacherIds:[candidate.teacherId], crossTeacher:false, classes:[candidate], stageSets:[], analysis:{} });
      });
    });
    groups.forEach((group,index) => {
      group.stageSets = bestCombineSets(group.classes);
      group.relationship = group.classes.length === 1 ? "separate" : group.stageSets.length === 1 ? "combine" : "share";
      group.quality = qualityFor(group.classes);
      group.analysis = analysisFor(group.classes);
      group.name = `${group.classes[0]?.teacher || "Teacher"} · ${title(group.requirement)} Routine ${index+1}`;
    });
    return groups;
  };
  const crossTeacherSuggestions = (classes,internalGroups) => {
    const internal=internalGroups.filter((group)=>!group.crossTeacher&&group.decision!=="rejected"),groupFor=(classId)=>internal.find((group)=>group.classes.some((item)=>item.id===classId)),showFor=(item)=>state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id],routineIds=(teacherId,show)=>new Set(internal.filter((group)=>group.classes.some((item)=>item.teacherId===teacherId&&showFor(item)===show)).map((group)=>group.id));
    const eligible=classes.filter((item)=>{const group=groupFor(item.id),set=group?.stageSets.find((members)=>members.some((member)=>member.id===item.id));return group&&(set?.length||0)===1&&item.count>0&&showFor(item);}).sort((a,b)=>(a.avgAge??999)-(b.avgAge??999));
    const suggestions=[],seenRoutinePairs=new Set(),showKeysForGroup=(group)=>new Set(group.classes.map((candidate)=>{const show=showFor(candidate);return show?`${candidate.teacherId}::${show}`:"";}).filter(Boolean));
    eligible.forEach((seed,index)=>eligible.slice(index+1).forEach((item)=>{
      if(item.teacherId===seed.teacherId||item.requirement!==seed.requirement||seed.count+item.count>STAGE_CAP)return;
      const spread=ageSpread([seed,item]);if(spread!=null&&spread>18)return;
      const seedGroup=groupFor(seed.id),itemGroup=groupFor(item.id),routinePairKey=[seedGroup.id,itemGroup.id].sort().join("||");if(seenRoutinePairs.has(routinePairKey))return;
      const seedShow=showFor(seed),itemShow=showFor(item),seedRoutines=routineIds(seed.teacherId,seedShow),itemRoutines=routineIds(item.teacherId,itemShow),projected=new Set([...seedRoutines,...itemRoutines]).size-1;
      if(projected>15)return;
      seenRoutinePairs.add(routinePairKey);
      const sourceRoutineUses=[showKeysForGroup(seedGroup).size,showKeysForGroup(itemGroup).size],resultingShowUses=new Set([...showKeysForGroup(seedGroup),...showKeysForGroup(itemGroup)]).size,targetFourPriority=resultingShowUses===4?2:resultingShowUses<4?1:0,best=[seed,item],base=analysisFor(best,true);base.reasons=[...(resultingShowUses===4?[`Combining these routines completes one routine used across 4 teacher shows without duplicating it on a teacher show`]:[`The combined routine would be used across ${resultingShowUses} teacher shows without duplicating it on a teacher show`]),...base.reasons,projected<12?`Their teacher shows currently total ${projected} unique routines, leaving room for another teacher show`:`Their teacher shows total ${projected} unique routines`];
      const teacherShowMatchKey=[[seed.teacherId,seedShow],[item.teacherId,itemShow]].map((entry)=>entry.join("::")).sort().join("||");
      suggestions.push({id:`cross-${seed.id}-${item.id}`,name:`${seed.teacher} + ${item.teacher} · ${title(seed.requirement)} Combine`,requirement:seed.requirement,relationship:"combine",quality:qualityFor(best),decision:"suggested",owner:"shared",teacherIds:[seed.teacherId,item.teacherId],crossTeacher:true,classes:best,stageSets:[best],projectedRoutineTotal:projected,resultingShowUses,sourceRoutineUses,targetFourPriority,teacherShows:[seedShow,itemShow],teacherShowMatchKey,analysis:base});
    }));
    const matchCounts=suggestions.reduce((counts,suggestion)=>counts.set(suggestion.teacherShowMatchKey,(counts.get(suggestion.teacherShowMatchKey)||0)+1),new Map());
    suggestions.forEach((suggestion)=>{suggestion.priorityMatchCount=matchCounts.get(suggestion.teacherShowMatchKey)||1;if(suggestion.priorityMatchCount>1)suggestion.analysis.reasons=[`${suggestion.priorityMatchCount} routines can combine between these two teacher shows — priority match`,...suggestion.analysis.reasons];});
    return suggestions.sort((a,b)=>(b.targetFourPriority-a.targetFourPriority)||(Math.abs(4-a.resultingShowUses)-Math.abs(4-b.resultingShowUses))||(b.priorityMatchCount-a.priorityMatchCount)||(a.projectedRoutineTotal-b.projectedRoutineTotal)||((ageSpread(a.classes)??0)-(ageSpread(b.classes)??0)));
  };
  const rebuildCrossTeacherSuggestions = () => {
    const internal=state.groups.filter((group)=>!group.crossTeacher),fixed=state.groups.filter((group)=>group.crossTeacher&&(group.decision!=="suggested"||group.showsLinked)),reserved=new Set(fixed.flatMap((group)=>group.classes.map((item)=>item.id))),suggestions=crossTeacherSuggestions(state.classes.filter((item)=>!reserved.has(item.id)),internal);
    if(document.body.dataset.tourMode==="true"&&!suggestions.length){const available=state.classes.filter((item)=>!reserved.has(item.id)),pair=available.flatMap((seed,index)=>available.slice(index+1).map((item)=>[seed,item])).find(([seed,item])=>seed.teacherId!==item.teacherId&&seed.requirement===item.requirement&&seed.count+item.count<=STAGE_CAP&&((ageSpread([seed,item])??0)<=18));if(pair){const [seed,item]=pair,best=[seed,item],base=analysisFor(best,true);base.reasons=["Example: two teachers have matching class types and compatible ages",...base.reasons];suggestions.push({id:`cross-tour-example-${seed.id}-${item.id}`,name:`${seed.teacher} + ${item.teacher} · ${title(seed.requirement)} Example`,requirement:seed.requirement,relationship:"combine",quality:qualityFor(best),decision:"suggested",owner:"shared",teacherIds:[seed.teacherId,item.teacherId],crossTeacher:true,classes:best,stageSets:[best],projectedRoutineTotal:0,resultingShowUses:2,targetFourPriority:0,teacherShows:[],teacherShowMatchKey:"tour-example",priorityMatchCount:1,analysis:base});}}
    state.groups=[...internal,...fixed,...suggestions];
  };
  const snapshot = (item) => ({ planningClassId:item.id, sourceClassId:item.sourceClassId||item.id, recitalGroupId:item.recitalGroupId||null, name:item.name, school:item.school, teacher:item.teacher, count:item.count, minAge:item.minAge, maxAge:item.maxAge, requirement:item.requirement });
  const loadPersisted = async () => {
    if (!window.dtSupabase || !["admin","director"].includes(window.dtCurrentProfile?.role || "")) return [];
    const { data, error } = await window.dtSupabase.from("recital_routine_groups").select("*,recital_routine_group_classes(*)").eq("season",SEASON).neq("decision_state","rejected");
    if (error) { console.error("Big Stage plans could not load",error); return []; }
    return (data||[]).map((row)=>{
      const links=row.recital_routine_group_classes||[];
      const linkedClasses=links.map((link)=>state.classes.find((item)=>item.id===String(link.class_snapshot?.planningClassId||"")||(String(item.sourceClassId||item.id)===String(link.dance_class_id)&&String(item.recitalGroupId||"")===String(link.recital_performance_group_id||"")))).filter(Boolean);
      const stageKeys=[...new Set(links.map((link)=>link.stage_group_key||link.dance_class_id))];
      return { id:row.id,name:row.name,requirement:row.recital_requirement,relationship:row.relationship_type,quality:row.match_quality,decision:row.decision_state,owner:row.routine_owner_type,teacherIds:[...new Set(linkedClasses.map((item)=>item.teacherId))],crossTeacher:row.cross_teacher,classes:linkedClasses,stageSets:stageKeys.map((key)=>links.filter((link)=>(link.stage_group_key||link.dance_class_id)===key).map((link)=>state.classes.find((item)=>item.id===String(link.dance_class_id))).filter(Boolean)),analysis:row.analysis||analysisFor(linkedClasses),songId:row.analysis?.songId||"",songTitle:row.analysis?.songTitle||"",links};
    }).filter((group)=>group.classes.length);
  };
  const persistGroup = async (group) => {
    if (document.body.dataset.tourMode==="true" || !window.dtSupabase || String(group.id).startsWith("cross-") && group.decision==="suggested") return;
    const payload={ id:group.id,season:SEASON,name:group.name,recital_requirement:group.requirement,relationship_type:group.relationship,match_quality:group.quality,decision_state:group.decision,routine_owner_type:group.owner,cross_teacher:group.crossTeacher,analysis:{...group.analysis,songId:group.songId||null,songTitle:group.songTitle||null},created_by:window.dtCurrentProfile?.id||null };
    const { error }=await window.dtSupabase.from("recital_routine_groups").upsert(payload);
    if(error){ console.error(error); state.notice="That recital decision could not be saved."; return; }
    await window.dtSupabase.from("recital_routine_group_classes").delete().eq("group_id",group.id);
    const links=group.stageSets.flatMap((set,setIndex)=>set.map((item)=>({group_id:group.id,dance_class_id:item.sourceClassId||item.id,recital_performance_group_id:item.recitalGroupId||null,stage_group_key:`${group.id}-${setIndex+1}`,show_number:group.showAssignments?.[item.id]||null,class_snapshot:snapshot(item)})));
    if(links.length){const result=await window.dtSupabase.from("recital_routine_group_classes").insert(links);if(result.error)console.error(result.error);}
  };
  const mergePlans = (generated,persisted) => {
    const persistedClassIds=new Set(persisted.flatMap((group)=>group.classes.map((item)=>item.id)));
    return [...persisted,...generated.map((group)=>({...group,classes:group.classes.filter((item)=>!persistedClassIds.has(item.id))})).filter((group)=>group.classes.length)];
  };
  const enforceUniqueRoutinePerSchool = (groups) => groups.flatMap((group) => {
    if (!hasSchoolConflict(group.classes)) return [group];
    const buckets = [];
    group.classes.forEach((item) => {
      const bucket = buckets.find((candidate) => !candidate.some((existing) => schoolKey(existing.school) === schoolKey(item.school)));
      if (bucket) bucket.push(item); else buckets.push([item]);
    });
    return buckets.map((classes,index) => {
      const stageSets = group.relationship === "separate" ? classes.map((item) => [item]) : bestCombineSets(classes);
      return {
        ...group,
        id: index === 0 ? group.id : crypto.randomUUID(),
        name: index === 0 ? group.name : `${group.name} · Separate Routine ${index+1}`,
        decision: group.decision === "suggested" ? "suggested" : "modified",
        teacherIds: [...new Set(classes.map((item) => item.teacherId))],
        crossTeacher: new Set(classes.map((item) => item.teacherId)).size > 1,
        classes,
        stageSets,
        relationship: classes.length === 1 ? "separate" : stageSets.length === 1 ? "combine" : "share",
        quality: qualityFor(classes),
        analysis: analysisFor(classes, new Set(classes.map((item) => item.teacherId)).size > 1),
        schoolRuleAdjusted: true
      };
    });
  });
  const enforceStageCapacity = (groups) => groups.map((group) => {
    const total = group.classes.reduce((sum, item) => sum + item.count, 0);
    if (group.relationship !== "combine" || total <= STAGE_CAP) return group;
    return {
      ...group,
      relationship: "share",
      stageSets: bestCombineSets(group.classes),
      decision: group.decision === "suggested" ? "suggested" : "modified",
      analysis: analysisFor(group.classes, group.crossTeacher)
    };
  });
  const teacherLoad = () => {
    const map=new Map();
    state.classes.forEach((item)=>{if(!map.has(item.teacherId))map.set(item.teacherId,{id:item.teacherId,name:item.teacher,classes:0,groups:new Set()});map.get(item.teacherId).classes+=1;});
    state.groups.filter((group)=>group.decision!=="rejected").forEach((group)=>group.teacherIds.forEach((id)=>map.get(id)?.groups.add(group.id)));
    return [...map.values()].map((item)=>({...item,routines:item.groups.size,status:item.groups.size<3?"Under Preferred Range":item.groups.size<=7?"Within Preferred Range":"Above Preferred Range"})).sort((a,b)=>a.name.localeCompare(b.name));
  };
  const boardAgeStatus = (classes) => {
    const spread=ageSpread(classes);
    if(spread==null)return {tone:"review",label:"Birthdates needed"};
    if(spread<=12)return {tone:"strong",label:"Strong Match"};
    if(spread<=18)return {tone:"review",label:`${spread} Month Gap`};
    return {tone:"wide",label:`${spread} Month Gap`};
  };
  const boardClassCard = (item, draggable = false, combinedAges = null, showCombinedAge = false, combineControl = "") => `<article class="stage-board-class" data-stage-board-class="${esc(item.id)}" ${draggable?`draggable="true" title="Drag to another routine row"`:""}>
    ${combineControl}
    ${showCombinedAge&&combinedAges?`<span class="stage-combined-age"><b>Age: ${ageLabel(combinedAges.min)} – ${ageLabel(combinedAges.max)}</b><em>${combinedAges.total} Total Dancers</em></span>`:""}
    ${state.showPlan?.classShow?.[item.id]&&state.showPlan.classShow[item.id]!==showForSchool(item.school)?`<span class="stage-class-show-badge" style="--class-show-color:${esc(state.showColors[state.showPlan.classShow[item.id]])}">Show ${state.showPlan.classShow[item.id]} · Separate</span>`:""}
    <div><strong>${esc(item.name)}${item.students.some((student)=>String(student.gender||"").toLowerCase()==="male")?`<i class="stage-boy-bubble" title="Boy in this class" aria-label="Boy in this class">B</i>`:""}</strong><span>${item.count} dancer${item.count===1?"":"s"}</span></div>
    <small>${item.ageData?`${ageLabel(item.minAge)}–${ageLabel(item.maxAge)}`:"Birthdates needed"}</small>
    <span class="stage-board-style is-${esc(item.requirement)}">${item.requirement==="either"?"Undecided":title(item.requirement)}</span>
    <details class="stage-board-dancers"><summary>Dancers <span>${item.students.length}</span></summary><div>${item.students.map((student)=>{const age=monthsOld(student.birthdate);return `<article><span class="stage-board-dancer-photo">${student.photo?`<img src="${esc(student.photo)}" alt="">`:esc(boardDancerInitials(student))}</span><strong>${esc(boardDancerName(student))}</strong><small>${Number.isFinite(age)?ageLabel(age):"Age needed"}</small></article>`;}).join("")}</div></details>
  </article>`;
  const combinedAgeSummary = (classes) => {
    const ages=classes.flatMap((item)=>item.students.map((student)=>monthsOld(student.birthdate)).filter(Number.isFinite));
    return ages.length?{min:Math.min(...ages),max:Math.max(...ages),avg:ages.reduce((sum,age)=>sum+age,0)/ages.length,total:classes.reduce((sum,item)=>sum+item.count,0)}:null;
  };
  const recitalPlaylistSongs = () => {
    const playlists=typeof musicLibraryState!=="undefined"&&Array.isArray(musicLibraryState.playlists)?musicLibraryState.playlists:(window.DT_TEACHER_MUSIC_DATA?.playlists||[]);
    const recital=playlists.filter((playlist)=>String(playlist.name||playlist.title||"").toLowerCase().includes("recital"));
    const songs=recital.flatMap((playlist)=>typeof musicPlaylistTracks==="function"?musicPlaylistTracks(playlist):(playlist.tracks||playlist.songs||[]));
    return [...new Map(songs.map((song)=>[String(song.id||song.track_id||song.title),{id:String(song.id||song.track_id||song.title),title:song.title||song.name||"Untitled Song"}])).values()].sort((a,b)=>a.title.localeCompare(b.title));
  };
  const songTeacherWithAllShows = (songId,currentTeacherId) => {
    const usage=new Map();
    state.groups.filter((group)=>String(group.songId||"")===String(songId)).forEach((group)=>group.classes.forEach((item)=>{if(!usage.has(item.teacherId))usage.set(item.teacherId,new Set());const show=showForSchool(item.school);if(show)usage.get(item.teacherId).add(show);}));
    const owner=[...usage.entries()].find(([teacherId,shows])=>teacherId!==currentTeacherId&&shows.size>=4);
    return owner?teacherName(owner[0]):"";
  };
  const combinedSchoolPairs = (routines) => routines.flatMap((group)=>group.stageSets.filter((set)=>set.length>1).flatMap((set)=>set.flatMap((item,index)=>set.slice(index+1).map((other)=>[item.school,other.school]))));
  const orderedBoardSchools = (schools,routines) => {
    const pairs=combinedSchoolPairs(routines), adjacency=new Map(schools.map((school)=>[school,new Set()]));
    pairs.forEach(([left,right])=>{adjacency.get(left)?.add(right);adjacency.get(right)?.add(left);});
    const ordered=[],remaining=new Set(schools);
    while(remaining.size){const start=[...remaining].sort((a,b)=>(adjacency.get(b)?.size||0)-(adjacency.get(a)?.size||0)||a.localeCompare(b))[0];const queue=[start];while(queue.length){const school=queue.shift();if(!remaining.has(school))continue;remaining.delete(school);ordered.push(school);[...(adjacency.get(school)||[])].sort().forEach((next)=>{if(remaining.has(next))queue.push(next);});}}
    return ordered.map((school,index)=>({school,index,show:showForSchool(school)||99})).sort((a,b)=>a.show-b.show||a.index-b.index).map((item)=>item.school);
  };
  const combineOptionsFor = (group,item) => {const itemShow=showForSchool(item.school);if(!itemShow)return [];const sameShow=group.classes.filter((candidate)=>showForSchool(candidate.school)===itemShow),total=sameShow.reduce((sum,candidate)=>sum+candidate.count,0),spread=ageSpread(sameShow);if(sameShow.length<2||hasSchoolConflict(sameShow)||total>STAGE_CAP||(spread!=null&&spread>18)||sameShow.some((candidate)=>!compatibleRequirement(candidate.requirement,item.requirement)))return [];return sameShow.filter((candidate)=>candidate.id!==item.id).sort((a,b)=>a.count-b.count);};
  const schoolPairKey = (left,right) => [left,right].map((value)=>schoolKey(value)).sort().join("::");
  const confirmedSchoolPairKeys = () => new Set(combinedSchoolPairs(state.groups).map(([left,right])=>schoolPairKey(left,right)));
  const isConfirmedSchoolPair = (left,right) => confirmedSchoolPairKeys().has(schoolPairKey(left,right));
  const boardCombineNotice = (group,item) => {
    const options=combineOptionsFor(group,item).sort((left,right)=>Number(isConfirmedSchoolPair(item.school,right.school))-Number(isConfirmedSchoolPair(item.school,left.school))||item.count+left.count-(item.count+right.count));
    if(options.length)return "";
    const blocked=group.classes.find((candidate)=>candidate.id!==item.id&&isConfirmedSchoolPair(item.school,candidate.school)&&!group.stageSets.some((set)=>set.length>1&&set.some((member)=>member.id===item.id)&&set.some((member)=>member.id===candidate.id)));
    if(!blocked)return "";
    const total=item.count+blocked.count,spread=ageSpread([item,blocked]),reason=total>STAGE_CAP?"More than 12 dancers.":!compatibleRequirement(item.requirement,blocked.requirement)?"Ballet and tap requirements conflict.":spread>18?"Age range is more than 18 months.":"These classes cannot combine.";
    return `<div class="stage-combine-warning is-blocked"><b aria-hidden="true">!</b><span><strong>Same Show Conflict</strong><small>${esc(reason)} Move one class to another routine.</small></span></div>`;
  };
  const showForSchool = (school) => {
    if(!state.showPlan)return null;
    const remembered=state.schoolShows[`${state.boardTeacher}::${school}`];if(remembered)return remembered;
    const shows=state.classes.filter((item)=>item.school===school&&(!state.boardTeacher||item.teacherId===state.boardTeacher)).map((item)=>state.showPlan.classShow[item.id]).filter(Boolean);
    return shows.length&&new Set(shows).size===1?shows[0]:null;
  };
  const boardSchoolColor = (school,schools,routines) => {
    const show=showForSchool(school);if(show)return state.showColors[show];
    const pairs=combinedSchoolPairs(routines),connected=new Set([school]);let changed=true;
    while(changed){changed=false;pairs.forEach(([left,right])=>{if(connected.has(left)&&!connected.has(right)){connected.add(right);changed=true;}if(connected.has(right)&&!connected.has(left)){connected.add(left);changed=true;}});}
    if(connected.size<2)return "#eadfd9";
    const palette=["#dba9a1","#b8c8aa","#e3bd74","#aebfd3","#c8afd8","#89c3b0"];
    const anchor=[...connected].sort()[0],index=Math.max(0,schools.slice().sort().indexOf(anchor));return palette[index%palette.length];
  };
  const boardShowBands = (schools) => {
    const bands=[];
    schools.forEach((school,index)=>{const show=showForSchool(school),key=show?`show-${show}`:"unassigned",previous=bands.at(-1);if(previous?.key===key)previous.span+=1;else bands.push({key,show,start:index+2,span:1});});
    return bands;
  };
  const boardShowBandsMarkup = (schools) => {const pending=state.pendingShows[state.boardTeacher];return `<div class="stage-show-bands" style="grid-template-columns:180px repeat(${schools.length},minmax(225px,1fr))"><div class="stage-show-band-corner"><span>Shows</span>${pending?`<em class="stage-pending-show" draggable="true" data-stage-unplaced-show="${pending}" style="--show-color:${esc(state.showColors[pending])}" title="Drag Show ${pending} onto a school">Show ${pending}</em>`:""}<button type="button" data-stage-add-show aria-label="Add the next teacher show" title="Add the next teacher show">＋</button></div>${boardShowBands(schools).map((band)=>{const color=band.show?state.showColors[band.show]:"#74646b";return `<div class="stage-show-band ${band.show?"":"is-unassigned"}" data-stage-show-band="${band.show||""}" data-stage-band-start="${band.start-2}" data-stage-band-span="${band.span}" style="grid-column:${band.start}/span ${band.span};--show-color:${esc(color)}">${band.show?`<i class="stage-show-resizer is-start" data-stage-show-resize="start" aria-label="Resize Show ${band.show} from the left"></i>`:""}<span>${band.show?`Show ${band.show}`:"Planning Pool"}</span><strong>${band.span} School${band.span===1?"":"s"}</strong>${band.show?`<i class="stage-show-resizer is-end" data-stage-show-resize="end" aria-label="Resize Show ${band.show} from the right"></i>`:""}</div>`;}).join("")}</div>`;};
  const linkedCombinedSchools = (school) => {
    const linked=new Set([school]),pairs=combinedSchoolPairs(state.groups.filter((group)=>group.decision!=="rejected"&&!group.crossTeacher&&group.classes.some((item)=>item.teacherId===state.boardTeacher)));let changed=true;while(changed){changed=false;pairs.forEach(([left,right])=>{if(linked.has(left)&&!linked.has(right)){linked.add(right);changed=true;}if(linked.has(right)&&!linked.has(left)){linked.add(left);changed=true;}});}return [...linked];
  };
  const setSchoolShow = (school,show) => {
    if(!state.showPlan)return;const schools=linkedCombinedSchools(school);
    schools.forEach((linkedSchool)=>{const key=`${state.boardTeacher}::${linkedSchool}`;if(show)state.schoolShows[key]=show;else delete state.schoolShows[key];});
    state.classes.filter((item)=>schools.includes(item.school)&&(!state.boardTeacher||item.teacherId===state.boardTeacher)).forEach((item)=>{if(show)state.showPlan.classShow[item.id]=show;else delete state.showPlan.classShow[item.id];});
    state.groups.forEach((group)=>group.classes.filter((item)=>schools.includes(item.school)&&(!state.boardTeacher||item.teacherId===state.boardTeacher)).forEach((item)=>{group.showAssignments=group.showAssignments||{};if(show)group.showAssignments[item.id]=show;else delete group.showAssignments[item.id];}));
  };
  const setClassShow = (classId,show) => {
    if(!state.showPlan)return;const item=state.classes.find((candidate)=>candidate.id===classId);if(!item)return;const key=`${item.teacherId}::${item.school}`;if(!state.schoolShows[key]){const current=showForSchool(item.school);if(current)state.schoolShows[key]=current;}if(show)state.showPlan.classShow[classId]=show;else delete state.showPlan.classShow[classId];state.groups.forEach((group)=>{if(!group.classes.some((candidate)=>candidate.id===classId))return;group.showAssignments=group.showAssignments||{};if(show)group.showAssignments[classId]=show;else delete group.showAssignments[classId];});
  };
  const siblingSplitFor = (classIds,targetShow) => {
    const moving=new Set(classIds);return siblingComponents().find(([left,right])=>{if(!moving.has(left)&&!moving.has(right))return false;const other=moving.has(left)?right:left;if(moving.has(other))return false;const otherClass=state.classes.find((item)=>item.id===other),otherShow=state.showPlan?.classShow?.[other]||showForSchool(otherClass?.school);return otherShow&&otherShow!==targetShow;});
  };
  const normalizeCombinedShowAssignments = (routines) => {
    routines.forEach((group)=>group.stageSets.filter((set)=>set.length>1).forEach((set)=>{const show=set.map((item)=>state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id]).find(Boolean);if(show)setSchoolShow(set[0].school,show);}));
  };
  const teacherPlanningBoard = () => {
    const loads=teacherLoad();
    if(!loads.length)return `<div class="stage-empty"><h4>No active recital classes yet.</h4><p>The board will populate from Classes & Rosters.</p></div>`;
    if(!state.boardTeacher||!loads.some((item)=>item.id===state.boardTeacher))state.boardTeacher=loads[0].id;
    const load=loads.find((item)=>item.id===state.boardTeacher);
    const classes=state.classes.filter((item)=>item.teacherId===state.boardTeacher).sort((a,b)=>(a.avgAge??999)-(b.avgAge??999)||a.name.localeCompare(b.name,undefined,{numeric:true}));
    const routines=state.groups.filter((group)=>group.decision!=="rejected"&&(group.classes.some((item)=>item.teacherId===state.boardTeacher)||group.emptyForTeacher===state.boardTeacher)&&!group.crossTeacher);normalizeCombinedShowAssignments(routines);
    const schools=orderedBoardSchools([...new Set(classes.map((item)=>item.school))],routines);
    const recitalSongs=recitalPlaylistSongs();
    return `<section class="stage-teacher-board ${state.fullscreen?"is-workspace-fullscreen":""}" data-stage-teacher-planning-board>${state.fullscreen?`<button type="button" class="stage-fullscreen-close" data-stage-exit-fullscreen aria-label="Exit fullscreen planning view">×</button>`:""}
      <nav class="stage-teacher-tabs" aria-label="Teacher planning boards">${loads.map((item)=>{const color=state.classes.find((candidate)=>candidate.teacherId===item.id)?.teacherColor||teacherColor(item.name);return `<button type="button" data-stage-board-teacher="${esc(item.id)}" aria-pressed="${item.id===state.boardTeacher}" style="--teacher-tab-color:${esc(color)}">${esc(item.name)}<small>${item.routines} routine${item.routines===1?"":"s"}</small></button>`;}).join("")}</nav>
      <header class="stage-board-header" style="--stage-teacher-color:${esc(classes[0]?.teacherColor||"#dba9a1")}"><div class="stage-board-primary-controls"><button type="button" class="stage-fullscreen-open" data-stage-enter-fullscreen>Fullscreen</button><button class="stage-undo-button" data-stage-undo ${state.history.length?"":"disabled"}>← Undo</button><button class="stage-save-button is-${state.saveStatus||"idle"}" data-stage-save-work ${state.saveStatus==="saving"?"disabled":""}>${state.saveStatus==="saving"?"Saving…":state.saveStatus==="saved"?"✓ Saved":state.saveStatus==="error"?"Save Failed":"Save Work"}</button></div><div class="stage-board-teacher-title"><h4>${esc(load.name)}</h4><p>${schools.length} School${schools.length===1?"":"s"} · ${classes.length} Planning Class${classes.length===1?"":"es"}</p><strong class="stage-board-dance-total">${classes.length} classes → ${routines.length} dances</strong></div><div class="stage-show-color-key stage-board-header-controls">${Object.keys(state.showColors).map(Number).sort((a,b)=>a-b).map((number)=>`<label style="--show-color:${esc(state.showColors[number])}"><span>Show ${number}</span><input type="color" value="${esc(state.showColors[number])}" data-stage-show-color="${number}" aria-label="Change Show ${number} color"></label>`).join("")}</div><p class="stage-layer-help stage-board-show-help">These Show 1–4 labels belong only to ${esc(load.name)}. They do not match another teacher's show numbers.</p></header>
      <section class="stage-routine-board"><header><div><h4>Routine Rows</h4><p>Suggestions populate automatically. Drag a class vertically to change its routine.</p></div></header>${routines.length?`<div class="stage-routine-matrix" style="--stage-school-count:${schools.length};--stage-matrix-width:calc(180px + ${schools.length} * 225px)">${boardShowBandsMarkup(schools)}<div class="stage-routine-column-heads" style="grid-template-columns:180px repeat(${schools.length},minmax(225px,1fr))"><div class="stage-routine-corner"><span>Routine</span><button type="button" data-stage-add-routine aria-label="Add another routine row" title="Add another routine row">＋</button></div>${schools.map((school)=>{const show=showForSchool(school),color=boardSchoolColor(school,schools,routines);return `<div data-stage-school-header="${esc(school)}" style="--school-color:${esc(color)}"><strong>${esc(school)}</strong><select data-stage-school-show="${esc(school)}" aria-label="Choose a show for ${esc(school)}"><option value="" ${show?"":"selected"}>Planning Pool</option>${[1,2,3,4].map((number)=>`<option value="${number}" ${show===number?"selected":""}>Show ${number}</option>`).join("")}</select></div>`;}).join("")}</div><div class="stage-routine-rows">${routines.map((group,index)=>{const teacherClasses=group.classes.filter((item)=>item.teacherId===state.boardTeacher);const status=boardAgeStatus(teacherClasses),showCount=new Set(teacherClasses.map((item)=>showForSchool(item.school)).filter(Boolean)).size;const combinedIds=new Set(group.stageSets.filter((set)=>set.length>1).flatMap((set)=>set.map((item)=>item.id)));return `<article class="stage-routine-row" data-stage-group="${esc(group.id)}"><div class="stage-routine-name"><select class="stage-routine-song" data-stage-routine-song aria-label="Choose a song for Routine ${index+1}"><option value="">Routine ${index+1}</option>${recitalSongs.map((song)=>{const usedBy=songTeacherWithAllShows(song.id,state.boardTeacher),disabled=Boolean(usedBy)&&String(group.songId||"")!==song.id;return `<option value="${esc(song.id)}" ${String(group.songId||"")===song.id?"selected":""} ${disabled?"disabled":""}>${esc(song.title)}${disabled?` — used on all shows by ${esc(usedBy)}`:""}</option>`;}).join("")}</select><small>${esc(title(group.requirement==="either"?"Undecided":group.requirement))} · ${teacherClasses.length>1?"Replicate":"Own Routine"}</small><span class="stage-board-age ${status.tone}">${status.tone==="strong"?`✓ ${esc(status.label)}`:`⚠ ${esc(status.label)}`}</span><small>Using ${showCount} ${showCount===1?"Time":"Times"}</small><button type="button" class="stage-remove-routine" data-stage-remove-routine="${esc(group.id)}" aria-label="Remove Routine ${index+1}" title="Remove routine">−</button></div><div class="stage-routine-slots" style="grid-template-columns:repeat(${schools.length},minmax(225px,1fr))">${schools.map((school)=>{const matches=teacherClasses.filter((item)=>item.school===school),color=boardSchoolColor(school,schools,routines),combinedSet=group.stageSets.find((set)=>set.length>1&&matches[0]&&set.some((member)=>member.id===matches[0].id)),combinedIndexes=(combinedSet||[]).map((member)=>schools.indexOf(member.school)).sort((a,b)=>a-b),schoolIndex=schools.indexOf(school),combinedPosition=!combinedSet?"":schoolIndex===combinedIndexes[0]?"is-combined-start":schoolIndex===combinedIndexes.at(-1)?"is-combined-end":"is-combined-middle";return `<div class="stage-routine-slot ${combinedIds.has(matches[0]?.id)?`is-combined ${combinedPosition}`:""}" data-stage-drop-group="${esc(group.id)}" style="--school-color:${esc(color)};--pair-color:${esc(color)}"><small>${esc(school)}</small>${matches.length?matches.map((item)=>`${boardClassCard(item,true,combinedSet?combinedAgeSummary(combinedSet):null,combinedPosition==="is-combined-end")}${boardCombineNotice(group,item)}`).join(""):`<span class="stage-routine-empty">Drop class here</span>`}</div>`;}).join("")}</div></article>`;}).join("")}</div></div>`:`<div class="stage-empty"><h4>No routine rows yet.</h4><p>Recalculate suggestions to create a starting plan.</p><button type="button" data-stage-add-routine>＋ Add Routine</button></div>`}</section>
      <div class="big-stage-note"><strong>Interactive preview:</strong> The board preserves the detailed matcher while you test dragging, stage combinations, school pairing, and show colors.</div>
    </section>`;
  };
  const filteredGroups = () => state.groups.filter((group) => (
    (!state.filters.teacher || group.classes.some((item) => item.teacherId === state.filters.teacher))
    && (!state.filters.school || group.classes.some((item) => item.school === state.filters.school))
    && (!state.filters.requirement || group.requirement === state.filters.requirement)
  ));
  const filterMarkup = () => {
    const teacherOptions = [...new Map(state.classes.map((item) => [item.teacherId,item.teacher])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
    const schoolOptions = [...new Set(state.classes.map((item) => item.school))].sort();
    return `<div class="stage-match-filters">
      <label>Teacher<select data-stage-filter="teacher"><option value="">All Teachers</option>${teacherOptions.map(([id,name])=>`<option value="${esc(id)}" ${state.filters.teacher===id?"selected":""}>${esc(name)}</option>`).join("")}</select></label>
      <label>School<select data-stage-filter="school"><option value="">All Schools</option>${schoolOptions.map((school)=>`<option value="${esc(school)}" ${state.filters.school===school?"selected":""}>${esc(school)}</option>`).join("")}</select></label>
      <label>Routine Need<select data-stage-filter="requirement"><option value="">All Routine Needs</option>${["ballet","tap","either"].map((value)=>`<option value="${value}" ${state.filters.requirement===value?"selected":""}>${title(value)}</option>`).join("")}</select></label>
      <div class="stage-filter-actions"><span>${filteredGroups().filter((group)=>group.crossTeacher).length} match${filteredGroups().filter((group)=>group.crossTeacher).length===1?"":"es"}</span><button class="secondary" type="button" data-stage-clear-filters>Clear Filters</button></div>
    </div>`;
  };
  const crossTeacherShowComparison = (group) => {
    if(!group.crossTeacher)return "";
    return `<div class="stage-cross-show-comparison">${group.classes.map((match,index)=>{const show=group.teacherShows?.[index]||state.schoolShows[`${match.teacherId}::${match.school}`]||state.showPlan?.classShow?.[match.id]||null,teacherRoutines=state.groups.filter((candidate)=>!candidate.crossTeacher&&candidate.decision!=="rejected"&&candidate.classes.some((item)=>item.teacherId===match.teacherId)),routines=teacherRoutines.filter((candidate)=>candidate.classes.some((item)=>item.teacherId===match.teacherId&&(state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id])===show)).sort((a,b)=>Number(b.classes.some((item)=>item.id===match.id))-Number(a.classes.some((item)=>item.id===match.id)));return `<section><header><strong>${esc(match.teacher)}</strong><span>${show?`Show ${show}`:"Planning Pool"} · ${routines.length} routine${routines.length===1?"":"s"}</span></header><div>${routines.length?routines.map((routine)=>{const proposed=routine.classes.some((item)=>item.id===match.id),uses=group.sourceRoutineUses||[],completesRoutineUse=proposed&&uses.length===2&&Math.min(...uses)===1&&Math.max(...uses)===3&&uses[index]===1,routineNumber=teacherRoutines.indexOf(routine)+1,showClasses=routine.classes.filter((item)=>item.teacherId===match.teacherId&&(state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id])===show),classLabel=showClasses.map((item)=>`${item.school} - ${item.name}`).join(" + ")||`${match.school} - ${match.name}`,type=routine.requirement==="either"?"Undecided":title(routine.requirement);return `<p class="${proposed?"is-proposed":""} ${completesRoutineUse?"completes-routine-use":""}"><span><b>Routine ${routineNumber}:</b> ${esc(classLabel)}${proposed?`<em>Proposed match</em>`:""}${completesRoutineUse?`<em class="stage-completes-use">* Completes Routine Use</em>`:""}</span><small class="stage-comparison-type is-${esc(routine.requirement)}">${esc(type)}</small></p>`;}).join(""):`<p class="is-proposed"><span><b>Routine 1:</b> ${esc(match.school)} - ${esc(match.name)}<em>Proposed match</em></span><small class="stage-comparison-type is-${esc(match.requirement)}">${esc(match.requirement==="either"?"Undecided":title(match.requirement))}</small></p>`}</div></section>`;}).join("")}</div>`;
  };
  const crossTeacherProposedCards = (group) => `<section class="stage-proposed-classes"><h6>Proposed Combined Classes</h6><div>${group.classes.map((item)=>{const matchedRoutine=state.groups.find((candidate)=>!candidate.crossTeacher&&candidate.decision!=="rejected"&&candidate.classes.some((member)=>member.id===item.id)),requirement=matchedRoutine?.requirement||item.requirement;return `<article style="--proposed-teacher-color:${esc(item.teacherColor||teacherColor(item.teacher))}"><header><span><small>${esc(item.teacher)}</small><strong>${esc(item.school)} · ${esc(item.name)}</strong></span><span>${item.count} dancer${item.count===1?"":"s"}</span></header><div class="stage-proposed-meta"><b>${item.ageData?`${ageLabel(item.minAge)} – ${ageLabel(item.maxAge)}`:"Birthdates needed"}</b><i class="stage-comparison-type is-${esc(requirement)}">${esc(requirement==="either"?"Undecided":title(requirement))}</i></div><div class="stage-proposed-students">${item.students.map((student)=>{const age=monthsOld(student.birthdate);return `<div><span>${student.photo?`<img src="${esc(student.photo)}" alt="">`:esc(boardDancerInitials(student))}</span><strong>${esc(boardDancerName(student))}</strong><small>${Number.isFinite(age)?ageLabel(age):"Age needed"}</small></div>`;}).join("")}</div></article>`;}).join("")}</div></section>`;
  const groupCard = (group) => {
    const total=group.classes.reduce((sum,item)=>sum+item.count,0), spread=ageSpread(group.classes);
    const canCombine=total<=STAGE_CAP;
    const relationLabel=group.relationship==="combine"?(group.crossTeacher?"Cross-Teacher Combine Suggested":"Combine Suggested"):group.relationship==="share"?"Share Choreography":"Keep Separate";
    const cardColor=group.crossTeacher?"":group.classes[0]?.teacherColor||"#dba9a1";
    const crossTeachers=[...new Set(group.classes.map((item)=>item.teacher))];
    return `<article class="stage-match-card ${group.crossTeacher?"cross-teacher":""} ${group.showsLinked?"shows-linked":""}" data-stage-group="${esc(group.id)}" ${cardColor?`style="--stage-teacher-color:${esc(cardColor)}"`:""}>
      ${group.crossTeacher?`<div class="stage-match-head stage-cross-match-head"><div class="stage-cross-title-row"><span class="stage-status ${group.quality}">${esc(title(group.quality))} Match</span><strong>Compatible Combo</strong><span class="stage-decision ${group.decision}">${esc(title(group.decision))}</span></div><h5>${crossTeachers.map(esc).join(" + ")}</h5><p>${total} Combined Dancer${total===1?"":"s"}${spread==null?"":` · ${spread} Month Age Span`}</p></div>`:`<div class="stage-match-head"><div><span class="stage-status ${group.quality}">${esc(title(group.quality))} Match</span><h5>${esc(group.name)}</h5><p>${esc(relationLabel)} · ${total} dancer${total===1?"":"s"}${spread==null?"":` · ${spread}-month age span`}</p></div><span class="stage-decision ${group.decision}">${esc(title(group.decision))}</span></div>`}
      ${group.crossTeacher?`${crossTeacherProposedCards(group)}${crossTeacherShowComparison(group)}`:`<div class="stage-class-list">${group.classes.map((item)=>`<div class="stage-class-row"><span><strong>${esc(item.school)} · ${esc(item.name)}</strong><small>${esc(item.teacher)} · ${item.count} dancers · ${item.ageData?`${ageLabel(item.minAge)} – ${ageLabel(item.maxAge)}`:`Birthdates needed`}</small></span><span>${esc(title(item.requirement))}</span></div>`).join("")}</div>`}
      ${group.crossTeacher?"":`<div class="stage-reasons">${(group.analysis.reasons||[]).map((reason)=>`<span>✓ ${esc(reason)}</span>`).join("")}</div>`}
      ${group.stageSets.length>1?`<div class="stage-combine-plan"><strong>Efficient stage plan</strong>${group.stageSets.map((set,index)=>`<span>Number ${index+1}: ${set.map((item)=>esc(item.school)).join(" + ")} · ${set.reduce((sum,item)=>sum+item.count,0)} dancers</span>`).join("")}</div>`:""}
      <div class="stage-card-actions ${group.crossTeacher?"stage-cross-actions":""}"><label>How will the classes perform?<select data-stage-relation><option value="combine" ${group.relationship==="combine"?"selected":""} ${canCombine?"":"disabled"}>Together on stage${canCombine?"":" — Over 12"}</option><option value="share" ${group.relationship==="share"?"selected":""}>Separately, using the same dance</option><option value="separate" ${group.relationship==="separate"?"selected":""}>Separately, with different dances</option></select></label>${group.crossTeacher?`<div class="stage-cross-action-row"><button class="primary" data-stage-approve>${group.decision==="approved"?"Approved ✓":"Approve"}</button>${group.relationship==="combine"?`<label class="stage-link-shows-check"><input type="checkbox" data-stage-link-shows-choice ${group.showsLinked?"checked":""}> Link Shows</label>`:""}</div>`:`<button class="primary" data-stage-approve>${group.decision==="approved"?"Approved ✓":"Approve"}</button><button class="secondary" data-stage-lock>${group.decision==="locked"?"Locked 🔒":"Lock"}</button><button class="secondary" data-stage-reject>Keep Separate</button>`}</div>
    </article>`;
  };
  const teacherView = () => { const groups=filteredGroups().filter((group)=>group.crossTeacher&&!(group.decision==="approved"&&group.relationship==="separate")); return `<section class="stage-cross-section"><h4>Compatible Combos</h4><p><strong>Combine compatible teacher shows while keeping ages, dance style, dancer counts, and routine totals balanced.</strong></p>${groups.length?`<div class="stage-match-grid stage-cross-match-grid">${groups.map(groupCard).join("")}</div>`:`<div class="stage-empty"><h4>No compatible combos fit yet.</h4><p>Complete the teacher planning boards first, or adjust a teacher show that would push a recital above 15 routines.</p></div>`}</section>`; };
  const schoolView = () => {
    const visible=filteredGroups();const schools=[...new Set(state.classes.map((item)=>item.school))].filter((school)=>!state.filters.school||school===state.filters.school).sort();
    return `<div class="stage-school-grid">${schools.map((school)=>{const classes=state.classes.filter((item)=>item.school===school&&(!state.filters.teacher||item.teacherId===state.filters.teacher));const groups=visible.filter((group)=>group.classes.some((item)=>item.school===school));if(!classes.length||!groups.length)return "";const shows=[...new Set(groups.flatMap((group)=>Object.values(group.showAssignments||{})))].filter(Boolean);const siblingCount=classes.flatMap((item)=>item.related).length;return `<article class="stage-school-card"><h5>${esc(school)}</h5><p>${classes.length} classes · ${classes.reduce((sum,item)=>sum+item.count,0)} dancers</p><div>${classes.map((item)=>`<span>${esc(item.name)} · ${esc(item.teacher)} · ${item.count}</span>`).join("")}</div><small>${groups.length} routine group${groups.length===1?"":"s"} · ${siblingCount} sibling link${siblingCount===1?"":"s"}${shows.length?` · Proposed Show ${shows.join(", ")}`:""}</small></article>`;}).join("")}</div>`;
  };
  const routineView = () => `<div class="stage-match-grid">${filteredGroups().sort((a,b)=>b.classes.length-a.classes.length).map(groupCard).join("")}</div>`;
  const siblingComponents = () => {
    const byName=new Map();state.classes.forEach((item)=>item.students.forEach((student)=>byName.set(fullName(student).toLowerCase(),item)));
    const edges=[];state.classes.forEach((item)=>item.students.forEach((student)=>String(student.relatedDancerName||"").split(" • ").map((name)=>name.trim().toLowerCase()).filter(Boolean).forEach((name)=>{const other=byName.get(name);if(other&&other.id!==item.id)edges.push([item.id,other.id]);})));
    return edges;
  };
  const sameShowRoutineConflicts = () => {
    const pairKeys=confirmedSchoolPairKeys(),conflicts=[];
    state.groups.filter((group)=>group.decision!=="rejected").forEach((group)=>group.classes.forEach((item,index)=>group.classes.slice(index+1).forEach((other)=>{
      if(!pairKeys.has(schoolPairKey(item.school,other.school)))return;
      const combined=group.stageSets.some((set)=>set.length>1&&set.some((member)=>member.id===item.id)&&set.some((member)=>member.id===other.id));
      if(!combined)conflicts.push({group,item,other});
    })));
    return conflicts;
  };
  const buildShows = (save=false) => {
    const routineConflicts=sameShowRoutineConflicts();
    const shows=[1,2,3,4].map((number)=>({number,units:[],dancers:0,schools:new Set(),teachers:new Set(),styles:{ballet:0,tap:0,either:0}}));
    const priorClassShow={...(state.showPlan?.classShow||{})},classShow={},schoolShow=new Map(),siblingEdges=siblingComponents(),linkedRecitals=new Map(),linkByTeacherShow=new Map();
    state.groups.filter((group)=>group.crossTeacher&&group.showsLinked).forEach((group)=>{const keys=group.classes.map((item,index)=>{const show=group.teacherShows?.[index]||state.schoolShows[`${item.teacherId}::${item.school}`]||priorClassShow[item.id];return show?`${item.teacherId}::${show}`:"";}).filter(Boolean),pairKey=keys.slice().sort().join("||");if(keys.length>1)keys.forEach((key)=>linkByTeacherShow.set(key,pairKey));});
    const groups=state.groups.filter((group)=>group.decision!=="rejected"&&(!group.crossTeacher||group.decision!=="suggested"));
    groups.sort((a,b)=>b.classes.reduce((s,x)=>s+x.count,0)-a.classes.reduce((s,x)=>s+x.count,0));
    groups.forEach((group)=>group.stageSets.forEach((set,setIndex)=>{
      const schools=[...new Set(set.map((item)=>item.school))];
      const linkedKeys=set.map((item)=>{const show=state.schoolShows[`${item.teacherId}::${item.school}`]||priorClassShow[item.id];return show?linkByTeacherShow.get(`${item.teacherId}::${show}`):null;}).filter(Boolean),forced=[...new Set([...schools.map((school)=>schoolShow.get(school)),...set.flatMap((item)=>siblingEdges.filter((edge)=>edge.includes(item.id)).flatMap((edge)=>edge.map((id)=>classShow[id]))),...linkedKeys.map((key)=>linkedRecitals.get(key))].filter(Boolean))];
      const candidates=forced.length===1?shows.filter((show)=>show.number===forced[0]):shows;
      const sameRoutineShows=new Set(group.stageSets.slice(0,setIndex).flatMap((prior)=>prior.map((item)=>classShow[item.id])).filter(Boolean));
      const chosen=[...candidates].sort((a,b)=>(sameRoutineShows.has(a.number)-sameRoutineShows.has(b.number))||(a.dancers-b.dancers)||(a.units.length-b.units.length))[0];
      linkedKeys.forEach((key)=>linkedRecitals.set(key,chosen.number));const dancers=set.reduce((sum,item)=>sum+item.count,0);chosen.units.push({group,set});chosen.dancers+=dancers;chosen.styles[group.requirement]=(chosen.styles[group.requirement]||0)+1;set.forEach((item)=>{classShow[item.id]=chosen.number;chosen.schools.add(item.school);chosen.teachers.add(item.teacher);if(!schoolShow.has(item.school))schoolShow.set(item.school,chosen.number);});
    }));
    state.groups.forEach((group)=>{group.showAssignments={};group.classes.forEach((item)=>{group.showAssignments[item.id]=classShow[item.id];});});
    state.showPlan={shows,classShow};state.notice=routineConflicts.length?`Four provisional shows are visible. Resolve ${routineConflicts.length} same-show conflict${routineConflicts.length===1?"":"s"} before final approval.`:"Four provisional shows built after routine grouping. Review warnings before approval.";
    if(save)state.groups.filter((group)=>["approved","modified","locked"].includes(group.decision)).forEach(persistGroup);
  };
  const teacherShowForItem = (item) => state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id]||null;
  const linkedTeacherShowsFor = (teacherId,show) => state.groups.filter((group)=>group.crossTeacher&&group.showsLinked).flatMap((group)=>group.classes.flatMap((item,index)=>{const itemShow=group.teacherShows?.[index]||teacherShowForItem(item);if(item.teacherId!==teacherId||Number(itemShow)!==Number(show))return [];return group.classes.map((other,otherIndex)=>({teacherId:other.teacherId,show:Number(group.teacherShows?.[otherIndex]||teacherShowForItem(other))})).filter((entry)=>entry.teacherId!==teacherId&&entry.show);}));
  const recitalUnits = (recital) => {
    const selected=state.recitalTeacherShows[recital]||{};
    const units=state.groups.filter((group)=>!group.crossTeacher&&group.decision!=="rejected").map((group)=>{const classes=group.classes.filter((item)=>Number(selected[item.teacherId])===Number(teacherShowForItem(item)));return classes.length?{group,classes}:null;}).filter(Boolean);
    state.groups.filter((group)=>group.crossTeacher&&group.showsLinked&&group.decision!=="rejected").forEach((linked)=>{const linkedSelected=linked.classes.every((item,index)=>Number(selected[item.teacherId])===Number(linked.teacherShows?.[index]||teacherShowForItem(item)));if(!linkedSelected)return;const sourceUnits=units.filter((unit)=>linked.classes.some((match)=>unit.group.classes.some((item)=>item.id===match.id)));if(sourceUnits.length<2)return;const insertAt=Math.min(...sourceUnits.map((unit)=>units.indexOf(unit))),classes=[...new Map(sourceUnits.flatMap((unit)=>unit.classes).map((item)=>[item.id,item])).values()],teachers=[...new Set(classes.map((item)=>item.teacher))],decidedRequirements=[...new Set(sourceUnits.map((unit)=>unit.group.requirement).filter((requirement)=>requirement&&requirement!=="either"))],resolvedRequirement=decidedRequirements.length===1?decidedRequirements[0]:linked.requirement,merged={...linked,requirement:resolvedRequirement,name:`${teachers.join(" + ")} · ${resolvedRequirement==="either"?"Undecided":title(resolvedRequirement)} Cross-Teacher Routine`,crossTeacher:true};sourceUnits.forEach((unit)=>units.splice(units.indexOf(unit),1));units.splice(insertAt,0,{group:merged,classes});});
    return units;
  };
  const showView = () => {
    const recital=state.activeRecital||"A",selected=state.recitalTeacherShows[recital]||{},loads=teacherLoad(),units=recitalUnits(recital),classIds=new Set(units.flatMap((unit)=>unit.classes.map((item)=>item.id))),classes=state.classes.filter((item)=>classIds.has(item.id)),routineCount=units.length,dancers=classes.reduce((sum,item)=>sum+item.count,0),schools=new Set(classes.map((item)=>item.school)).size,tapCount=units.filter((unit)=>unit.group.requirement==="tap").length,balletCount=units.filter((unit)=>unit.group.requirement==="ballet").length,status=routineCount>15?{label:"Over Limit",tone:"over"}:routineCount>=12?{label:"Within Goal",tone:"goal"}:{label:"Room for More",tone:"room"};
    return `<section class="stage-recital-builder"><nav class="stage-recital-tabs" aria-label="Choose a recital">${["A","B","C","D"].map((letter)=>`<button type="button" data-stage-recital-tab="${letter}" aria-pressed="${recital===letter}">Recital ${letter}<small>${recitalUnits(letter).length} routines</small></button>`).join("")}</nav><header><div><span>RECITAL ${recital}</span><h4>Build Recital ${recital}</h4><p>Select one show from each teacher. Linked shows are selected together automatically.</p></div><div class="stage-show-metrics"><span>${routineCount} routines</span><span>${dancers} dancers</span><span>${schools} schools</span><span class="is-tap">${tapCount} Tap</span><span class="is-ballet">${balletCount} Ballet</span><b class="stage-routine-goal ${status.tone}">${status.label}</b></div></header><div class="stage-recital-teacher-selectors">${loads.map((teacher)=>{const available=[...new Set(state.classes.filter((item)=>item.teacherId===teacher.id).map(teacherShowForItem).filter(Boolean))].sort((a,b)=>a-b),value=selected[teacher.id]||"",locked=Boolean(state.recitalLocks[recital]?.[teacher.id]);return `<label class="${locked?"is-locked":""}"><span class="stage-recital-teacher-head"><strong>${esc(teacher.name)}</strong><button type="button" data-stage-recital-lock="${esc(teacher.id)}" ${value?"":"disabled"} aria-label="${locked?"Unlock":"Lock"} ${esc(teacher.name)} on Recital ${recital}" title="${locked?"Unlock teacher show":"Lock teacher show to this recital"}">${locked?"🔒":"🔓"}</button></span><select data-stage-recital-teacher-show="${esc(teacher.id)}" ${locked?"disabled":""}><option value="" ${value?"":"selected"}>None</option>${available.map((show)=>`<option value="${show}" ${Number(value)===Number(show)?"selected":""}>Show ${show}</option>`).join("")}</select>${value&&linkedTeacherShowsFor(teacher.id,value).length?`<small>Linked show selected automatically with its partner</small>`:""}</label>`;}).join("")}</div><div class="stage-recital-table"><div class="stage-recital-column-heads"><span>Order</span><span>Teacher</span><span>Dancers</span><span>Boys</span><span>School</span><span>Class</span><span>Age Range</span><span>Routine</span></div><div class="stage-recital-routines">${units.length?units.map(({group,classes},index)=>{const colors=[...new Set(classes.map((item)=>item.teacherColor||teacherColor(item.teacher)))],background=colors.length>1?`linear-gradient(180deg,${colors.map((color,stop)=>`color-mix(in srgb,${color} 24%,white) ${Math.round(stop*100/Math.max(1,colors.length-1))}%`).join(",")})`:`color-mix(in srgb,${colors[0]||"#dba9a1"} 18%,white)`,teachers=[...new Set(classes.map((item)=>item.teacher))],routineName=(group.crossTeacher?"Cross-Teacher Routine":String(group.name||"Routine").replace(/^[^·]+·\s*/,"")).replace(/^(Tap|Ballet|Either|Undecided)\s+/i,""),boyCount=classes.flatMap((item)=>item.students).filter((student)=>String(student.gender||"").toLowerCase()==="male").length,minimums=classes.map((item)=>item.minAge).filter(Number.isFinite),maximums=classes.map((item)=>item.maxAge).filter(Number.isFinite),ageRange=minimums.length&&maximums.length?`${ageLabel(Math.min(...minimums))} – ${ageLabel(Math.max(...maximums))}`:"Age needed";return `<article class="${group.crossTeacher?"is-cross-teacher":""}" style="--recital-routine-background:${esc(background)}"><span class="is-${esc(group.requirement)}">${index+1}</span><b>${teachers.map(esc).join(" + ")}</b><span class="stage-recital-dancer-count">${classes.reduce((sum,item)=>sum+item.count,0)}</span><span class="stage-recital-boy-count">${boyCount}</span><small>${[...new Set(classes.map((item)=>item.school))].map(esc).join(" + ")}</small><small>${classes.map((item)=>esc(item.name)).join(" + ")}</small><small class="stage-recital-age-range">${esc(ageRange)}</small><strong class="stage-recital-routine-title">${esc(routineName)}<i class="stage-comparison-type is-${esc(group.requirement)}">${esc(group.requirement==="either"?"Undecided":title(group.requirement))}</i>${group.crossTeacher?`<em>Cross-Teacher Combined</em>`:""}</strong></article>`;}).join(""):`<div class="stage-empty"><h4>No teacher shows selected</h4><p>Choose a show from a teacher dropdown to populate Recital ${recital}.</p></div>`}</div></div></section>`;
  };
  const productionView = () => {
    const selected=productionShows.find((show)=>show.id===state.productionShow);
    if(selected)return `<div class="big-stage-view-title"><button class="secondary" data-stage-production-back>← All Shows</button><div><h4>${esc(selected.time)} Show</h4><p>Saturday, May 22, 2027 · Drop-off ${esc(selected.drop)}</p></div></div><div class="big-stage-toolbar"><div><strong>Performance Flow Order</strong><p>${selected.performances} performances · ${selected.dancers} dancers</p></div><div class="big-stage-actions"><button class="secondary" type="button">Preview Newsletter</button><button class="primary" type="button">+ Assign a Class</button></div></div><div class="stage-empty"><h4>Show production stays right here.</h4><p>Flow order, songs, costumes, props, participation, and family communication remain separate from Recital Matching.</p></div>`;
    return `<div class="big-stage-toolbar"><div><h4>2027 Dance Techniques Recital</h4><p>Start fresh by creating the first recital.</p></div><div class="big-stage-actions"><button class="secondary" type="button">+ Create Recital Newsletter</button><button class="primary" type="button" data-stage-new>+ Add Show</button></div></div><div class="big-stage-show-grid">${productionShows.map((show)=>`<button class="big-stage-show-card" data-stage-production-show="${show.id}"><div class="big-stage-show-top"><div><div class="big-stage-show-time">${esc(show.time)}</div><div class="big-stage-show-date">Saturday, May 22, 2027</div></div><span class="big-stage-pill">${show.ready}% planned</span></div><div>Rockwall-Heath High School<br><small>Student drop-off · ${esc(show.drop)}</small></div><div class="big-stage-show-meta"><div class="big-stage-stat"><strong>${show.schools}</strong><small>Schools</small></div><div class="big-stage-stat"><strong>${show.performances}</strong><small>Performances</small></div><div class="big-stage-stat"><strong>${show.dancers}</strong><small>Dancers</small></div></div><div class="big-stage-progress"><span style="width:${show.ready}%"></span></div></button>`).join("")}</div><div class="big-stage-note"><strong>No recitals are currently active.</strong> Use Add Show when you are ready to begin again.</div>`;
  };
  const decorateCombineToggles = () => {
    root()?.querySelectorAll(".stage-routine-row[data-stage-group]").forEach((row)=>{const group=state.groups.find((item)=>item.id===row.dataset.stageGroup);if(!group)return;row.querySelectorAll("[data-stage-board-class]").forEach((card)=>{const item=group.classes.find((candidate)=>candidate.id===card.dataset.stageBoardClass);if(!item)return;const handle=`<button type="button" class="stage-class-show-handle" draggable="true" data-stage-class-show-handle="${esc(item.id)}" aria-label="Drag ${esc(item.name)} to another show" title="Drag to another show"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M1 8h14M8 1 5.5 3.5M8 1l2.5 2.5M8 15l-2.5-2.5M8 15l2.5-2.5M1 8l2.5-2.5M1 8l2.5 2.5M15 8l-2.5-2.5M15 8l-2.5 2.5"/></svg></button>`,combinedSet=group.stageSets.find((set)=>set.length>1&&set.some((member)=>member.id===item.id));if(combinedSet){const leader=combinedSet[0]?.id===item.id;if(leader)card.insertAdjacentHTML("afterbegin",`${handle}<button type="button" class="stage-combine-toggle is-combined" data-stage-uncombine-class="${esc(item.id)}">✓ Combined</button>`);else card.insertAdjacentHTML("afterbegin",`<span class="stage-combine-toggle-placeholder" aria-hidden="true"></span>`);return;}card.insertAdjacentHTML("afterbegin",handle);const candidate=combineOptionsFor(group,item)[0];if(candidate)card.insertAdjacentHTML("afterbegin",`<button type="button" class="stage-combine-toggle" data-stage-combine-class="${esc(item.id)}" data-stage-combine-with="${esc(candidate.id)}">Combine?</button>`);});});
  };
  const alignCombinedHeaderControls = () => {
    root()?.querySelectorAll(".stage-routine-row[data-stage-group]").forEach((row)=>{const group=state.groups.find((item)=>item.id===row.dataset.stageGroup);if(!group)return;group.stageSets.filter((set)=>set.length>1).forEach((set)=>{const cards=set.map((item)=>row.querySelector(`[data-stage-board-class="${CSS.escape(item.id)}"]`)).filter(Boolean),button=cards.map((card)=>card.querySelector(".stage-combine-toggle.is-combined")).find(Boolean),handle=cards.map((card)=>card.querySelector(".stage-class-show-handle")).find(Boolean),header=cards.map((card)=>card.querySelector(".stage-combined-age")).find(Boolean);cards.forEach((card)=>card.querySelector(".stage-combine-toggle-placeholder")?.remove());if(header&&(button||handle)){const controls=document.createElement("span");controls.className="stage-combined-controls";if(handle)controls.append(handle);if(button)controls.append(button);header.prepend(controls);}});});
  };
  const decorateRoutineTypeControls = () => {
    root()?.querySelectorAll(".stage-routine-row[data-stage-group]").forEach((row)=>{const group=state.groups.find((item)=>item.id===row.dataset.stageGroup),name=row.querySelector(".stage-routine-name"),song=name?.querySelector(".stage-routine-song");if(!group||!name||!song)return;song.insertAdjacentHTML("afterend",`<select class="stage-routine-type is-${esc(group.requirement)}" data-stage-routine-type aria-label="Routine dance type"><option value="ballet" ${group.requirement==="ballet"?"selected":""}>Ballet</option><option value="tap" ${group.requirement==="tap"?"selected":""}>Tap</option><option value="either" ${group.requirement==="either"?"selected":""}>Undecided</option></select>`);const summary=name.querySelector("small:last-of-type");if(summary)summary.textContent=summary.textContent.replace(/\s*·\s*\([^)]*\)(?:\s*·\s*\([^)]*\))*/g,"");});
  };
  const decoratePendingShowColumn = () => {
    const pending=state.pendingShows[state.boardTeacher],matrix=root()?.querySelector(".stage-routine-matrix");if(!pending||!matrix)return;
    const bands=matrix.querySelector(".stage-show-bands"),heads=matrix.querySelector(".stage-routine-column-heads"),schoolCount=heads?.querySelectorAll("[data-stage-school-header]").length||0;if(!bands||!heads)return;
    bands.querySelector(".stage-pending-show")?.remove();
    const schoolHeaders=[...heads.querySelectorAll("[data-stage-school-header]")],poolIndex=schoolHeaders.findIndex((header)=>!header.querySelector("[data-stage-school-show]")?.value),insertIndex=poolIndex<0?schoolCount:poolIndex,columnCount=schoolCount+1,width=`calc(180px + ${columnCount} * 225px)`,poolBand=bands.querySelector(".stage-show-band.is-unassigned");matrix.style.setProperty("--stage-school-count",String(columnCount));matrix.style.setProperty("--stage-matrix-width",width);bands.style.gridTemplateColumns=`180px repeat(${columnCount}, minmax(225px, 1fr))`;heads.style.gridTemplateColumns=`180px repeat(${columnCount}, minmax(225px, 1fr))`;
    bands.querySelectorAll(".stage-show-band[data-stage-band-start]").forEach((band)=>{const start=Number(band.dataset.stageBandStart),span=Number(band.dataset.stageBandSpan)||1;if(start>=insertIndex)band.style.gridColumn=`${start+3}/span ${span}`;});
    const topper=`<div class="stage-show-band stage-pending-show-column" draggable="true" data-stage-unplaced-show="${pending}" style="grid-column:${insertIndex+2}/span 1;--show-color:${esc(state.showColors[pending])}" title="Drag Show ${pending} onto a school"><i class="stage-show-resizer is-start" aria-hidden="true"></i><span>Show ${pending}</span><strong>0 Schools</strong><i class="stage-show-resizer is-end" aria-hidden="true"></i></div>`;poolBand?poolBand.insertAdjacentHTML("beforebegin",topper):bands.insertAdjacentHTML("beforeend",topper);
    const poolHeader=schoolHeaders[insertIndex],blankHeader=`<div class="stage-pending-school-column" data-stage-show-band="${pending}" aria-label="Drop a school into Show ${pending}"><strong>Drop school here</strong></div>`;poolHeader?poolHeader.insertAdjacentHTML("beforebegin",blankHeader):heads.insertAdjacentHTML("beforeend",blankHeader);
    matrix.querySelectorAll(".stage-routine-slots").forEach((slots)=>{slots.style.gridTemplateColumns=`repeat(${columnCount}, minmax(225px, 1fr))`;const at=slots.children[insertIndex],blank=`<div class="stage-routine-slot stage-pending-routine-slot" data-stage-show-band="${pending}" aria-label="Drop a school into Show ${pending}"></div>`;at?at.insertAdjacentHTML("beforebegin",blank):slots.insertAdjacentHTML("beforeend",blank);});
  };
  const decorateSchoolColumnDragging = () => root()?.querySelectorAll("[data-stage-school-header]").forEach((header)=>{header.draggable=true;header.title=`Drag ${header.dataset.stageSchoolHeader} onto a show`;});
  const clearZeroBoyCounts = () => root()?.querySelectorAll(".stage-recital-boy-count").forEach((cell)=>{if(cell.textContent.trim()==="0")cell.textContent="";});
  const decorateLockedRecitalOptions = () => root()?.querySelectorAll("[data-stage-recital-teacher-show]").forEach((select)=>{const teacherId=select.dataset.stageRecitalTeacherShow;[...select.options].forEach((option)=>{const show=Number(option.value);if(!show)return;const locked=Object.entries(state.recitalTeacherShows).find(([letter,values])=>letter!==state.activeRecital&&Number(values[teacherId])===show&&state.recitalLocks[letter]?.[teacherId]);if(locked){option.disabled=true;option.textContent=`Show ${show} — Locked to Recital ${locked[0]}`;}});});
  const render = () => {
    if(!root())return;
    const body=state.view==="board"?teacherPlanningBoard():state.view==="teacher"?teacherView():state.view==="school"?schoolView():state.view==="routine"?routineView():showView();
    const matching=`<nav class="stage-view-tabs" aria-label="Recital planning views">${[["board","Teacher Planning Board"],["teacher","Compatible Combos"],["show","Recitals"]].map(([key,label])=>`<button data-stage-view="${key}" aria-pressed="${state.view===key}">${label}</button>`).join("")}</nav>${state.notice?`<div class="big-stage-note">${esc(state.notice)}</div>`:""}${state.view==="teacher"?filterMarkup():""}${state.loading?`<div class="stage-empty">Analyzing current classes, ages, recital needs, and family links…</div>`:body}`;
    root().innerHTML=`<div class="big-stage-shell"><nav class="stage-section-toggle" aria-label="The Big Stage sections"><button data-stage-section="shows" aria-pressed="${state.section==="shows"}">Show Production</button><button data-stage-section="matching" aria-pressed="${state.section==="matching"}">Recital Matching</button></nav>${state.section==="shows"?productionView():matching}</div>`;decorateCombineToggles();alignCombinedHeaderControls();decorateRoutineTypeControls();decoratePendingShowColumn();decorateSchoolColumnDragging();clearZeroBoyCounts();decorateLockedRecitalOptions();
  };
  const initialize = async (force=false) => {
    if(state.loading)return;state.loading=true;render();
    state.classes=(document.body.dataset.tourMode==="true"?tourPlannerClasses():activeRosterClasses().flatMap(planningClassRecords)).filter((item)=>item.id);
    const workspace=force?null:await loadPlannerWorkspace(),persisted=force?state.groups.filter((group)=>["approved","modified","locked"].includes(group.decision)):workspace||await loadPersisted();
    const generated=generatedGroups(state.classes);
    state.groups=enforceStageCapacity(enforceUniqueRoutinePerSchool(mergePlans(generated,workspace||persisted)));state.persisted=true;state.loading=false;
    const adjusted=state.groups.some((group)=>group.schoolRuleAdjusted);
    state.notice=adjusted?"Classes at the same school were separated into different routines.":force?"Suggestions recalculated. Approved, modified, and locked decisions were preserved.":"";if(!state.showPlan||!Object.keys(state.showPlan.classShow||{}).length)buildShows(false);rebuildCrossTeacherSuggestions();if(!adjusted&&!force)state.notice="";render();
  };
  const refreshBoardGroup = (group) => {
    group.classes=group.classes.filter(Boolean);
    group.teacherIds=[...new Set(group.classes.map((item)=>item.teacherId))];
    group.requirement=group.classes[0]?.requirement||"either";
    group.stageSets=group.stageSets.map((set)=>set.filter((item)=>group.classes.some((candidate)=>candidate.id===item.id))).filter((set)=>set.length);
    const staged=new Set(group.stageSets.flatMap((set)=>set.map((item)=>item.id)));
    group.classes.filter((item)=>!staged.has(item.id)).forEach((item)=>group.stageSets.push([item]));
    group.relationship=group.stageSets.some((set)=>set.length>1)?"share":group.classes.length>1?"share":"separate";
    group.quality=qualityFor(group.classes);group.analysis=analysisFor(group.classes,group.crossTeacher);group.decision=group.decision==="suggested"?"modified":group.decision;
  };
  const combineBoardClasses = async (group,leftId) => {
    const left=group.classes.find((item)=>item.id===leftId);if(!left)return;const sharedShow=showForSchool(left.school);if(!sharedShow){state.notice="Assign the schools to a teacher show before combining the row.";render();return;}
    const sameShow=group.classes.filter((item)=>showForSchool(item.school)===sharedShow),total=sameShow.reduce((sum,item)=>sum+item.count,0),spread=ageSpread(sameShow);if(sameShow.length<2){state.notice="No other school in this routine row is assigned to that show.";render();return;}if(hasSchoolConflict(sameShow)){state.notice="Classes at the same school cannot share choreography or the stage.";render();return;}if(total>STAGE_CAP){state.notice=`Those ${sameShow.length} schools have ${total} dancers, which exceeds the 12-dancer stage limit.`;render();return;}if(spread!=null&&spread>18){state.notice=`Those ${sameShow.length} schools have a ${spread}-month age gap, so they cannot all combine.`;render();return;}
    const combinedIds=new Set(sameShow.map((item)=>item.id));group.stageSets=group.stageSets.map((set)=>set.filter((item)=>!combinedIds.has(item.id))).filter((set)=>set.length);group.stageSets.push(sameShow);refreshBoardGroup(group);setSchoolShow(left.school,sharedShow);await persistGroup(group);
    state.notice=`All ${sameShow.length} schools in this row assigned to Show ${sharedShow} will share the stage.`;render();
  };
  document.addEventListener("change", async (event) => {
    const showColor=event.target.closest("[data-stage-show-color]");if(showColor){state.showColors[showColor.dataset.stageShowColor]=showColor.value;render();return;}
    const filter=event.target.closest("[data-stage-filter]");if(filter){state.filters[filter.dataset.stageFilter]=filter.value;render();return;}
    const recitalTeacherShow=event.target.closest("[data-stage-recital-teacher-show]");if(recitalTeacherShow){const recital=state.activeRecital,teacherId=recitalTeacherShow.dataset.stageRecitalTeacherShow,show=Number(recitalTeacherShow.value)||null,assignments=state.recitalTeacherShows[recital]||(state.recitalTeacherShows[recital]={});if(show){const partners=linkedTeacherShowsFor(teacherId,show),requested=[{teacherId,show},...partners],lockedConflict=Object.entries(state.recitalTeacherShows).find(([letter,values])=>letter!==recital&&requested.some((entry)=>Number(values[entry.teacherId])===entry.show&&state.recitalLocks[letter]?.[entry.teacherId]));if(lockedConflict){state.notice=`That teacher show is locked on Recital ${lockedConflict[0]}. Unlock it before moving it.`;render();return;}requested.forEach((entry)=>{Object.entries(state.recitalTeacherShows).forEach(([letter,values])=>{if(letter!==recital&&Number(values[entry.teacherId])===entry.show)delete values[entry.teacherId];});assignments[entry.teacherId]=entry.show;});state.notice=`Teacher show added to Recital ${recital}${partners.length?" with its linked show":""}.`;}else{delete assignments[teacherId];state.notice=`Teacher removed from Recital ${recital}.`;}render();return;}
    const schoolShow=event.target.closest("[data-stage-school-show]");if(schoolShow){const school=schoolShow.dataset.stageSchoolShow,show=Number(schoolShow.value)||null,linked=linkedCombinedSchools(school);setSchoolShow(school,show);state.notice=show?(linked.length>1?`${linked.join(" + ")} moved together to Show ${show}.`:`${school} moved to Show ${show}.`):`${linked.join(" + ")} moved to the Planning Pool.`;render();return;}
    const card=event.target.closest("[data-stage-group]");if(!card)return;const group=state.groups.find((item)=>item.id===card.dataset.stageGroup);if(!group)return;
    if(event.target.matches("[data-stage-routine-song]")){const song=recitalPlaylistSongs().find((item)=>item.id===event.target.value);group.songId=song?.id||"";group.songTitle=song?.title||"";group.decision=group.decision==="suggested"?"modified":group.decision;await persistGroup(group);state.notice=song?`${song.title} assigned to this routine.`:"Song assignment cleared.";render();return;}
    if(event.target.matches("[data-stage-routine-type]")){group.requirement=event.target.value;group.decision=group.decision==="suggested"?"modified":group.decision;await persistGroup(group);state.notice=`Routine marked ${event.target.value==="either"?"Undecided":title(event.target.value)}. Individual class designations were not changed.`;render();return;}
    if(event.target.matches("[data-stage-relation]")){group.relationship=event.target.value;group.decision="modified";if(group.crossTeacher&&group.relationship!=="combine")group.showsLinked=false;group.stageSets=group.relationship==="combine"?[group.classes]:group.classes.map((item)=>[item]);if(group.relationship==="combine"&&group.classes.reduce((sum,item)=>sum+item.count,0)>STAGE_CAP){group.relationship="share";group.stageSets=bestCombineSets(group.classes);state.notice="That full combine exceeds 12 dancers, so it remains shared choreography with safe stage groups.";}await persistGroup(group);render();}
    if(event.target.matches("[data-stage-link-shows-choice]")){group.showsLinked=event.target.checked;state.notice=group.showsLinked?`${group.classes.map((item,index)=>`${item.teacher} Show ${group.teacherShows?.[index]||state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id]||"?"}`).join(" + ")} linked for the same recital.`:"The teacher shows will remain independent.";render();return;}
    if(event.target.matches("[data-stage-owner]")){group.owner=event.target.value;group.decision=group.decision==="suggested"?"modified":group.decision;await persistGroup(group);render();}
  });
  const undoClickTargets="[data-stage-recalculate],[data-stage-build-shows],[data-stage-add-routine],[data-stage-remove-routine],[data-stage-add-show],[data-stage-combine-class],[data-stage-uncombine-class],[data-stage-link-shows],[data-stage-recital-lock],[data-stage-approve],[data-stage-lock],[data-stage-reject]";
  document.addEventListener("click",(event)=>{if(event.target.closest(undoClickTargets))rememberPlannerState();},true);
  document.addEventListener("change",(event)=>{if(event.target.closest("[data-stage-school-show],[data-stage-show-color],[data-stage-routine-song],[data-stage-routine-type],[data-stage-relation],[data-stage-link-shows-choice],[data-stage-recital-teacher-show]"))rememberPlannerState();},true);
  document.addEventListener("drop",(event)=>{if((state.draggedSchool||state.draggedShow||state.draggedClass)&&event.target.closest("[data-stage-show-band],[data-stage-unplaced-show],[data-stage-school-header],[data-stage-drop-group]"))rememberPlannerState();},true);
  document.addEventListener("click", async (event) => {
    if(event.target.closest("[data-stage-undo]")){if(undoPlannerState())render();return;}
    if(event.target.closest("[data-stage-save-work]")){const button=event.target.closest("[data-stage-save-work]");state.saveStatus="saving";button.textContent="Saving…";button.disabled=true;const saved=await savePlannerWorkspace();state.saveStatus=saved?"saved":"error";state.notice=saved?"Planning workspace saved. It will be restored after refresh.":"The planner could not be saved. Please try again.";render();window.setTimeout(()=>{if(state.saveStatus!==(saved?"saved":"error"))return;state.saveStatus="";const current=root()?.querySelector("[data-stage-save-work]");if(current){current.textContent="Save Work";current.className="stage-save-button is-idle";}},2500);return;}
    if(event.target.closest("[data-stage-enter-fullscreen]")){try{await document.documentElement.requestFullscreen?.();}catch(error){console.warn("True fullscreen was unavailable; using the enlarged planner view.",error);}state.fullscreen=true;render();return;}
    if(event.target.closest("[data-stage-exit-fullscreen]")){if(document.fullscreenElement)await document.exitFullscreen?.();state.fullscreen=false;render();return;}
    const section=event.target.closest("[data-stage-section]");if(section){state.section=section.dataset.stageSection;render();return;}
    const production=event.target.closest("[data-stage-production-show]");if(production){state.productionShow=production.dataset.stageProductionShow;render();return;}
    if(event.target.closest("[data-stage-production-back]")){state.productionShow="";render();return;}
    const view=event.target.closest("[data-stage-view]");if(view){state.view=view.dataset.stageView;if(state.view==="teacher")rebuildCrossTeacherSuggestions();render();return;}
    const recitalTab=event.target.closest("[data-stage-recital-tab]");if(recitalTab){state.activeRecital=recitalTab.dataset.stageRecitalTab;render();return;}
    const recitalLock=event.target.closest("[data-stage-recital-lock]");if(recitalLock){const recital=state.activeRecital,teacherId=recitalLock.dataset.stageRecitalLock,locks=state.recitalLocks[recital]||(state.recitalLocks[recital]={}),show=state.recitalTeacherShows[recital]?.[teacherId];if(!show)return;locks[teacherId]=!locks[teacherId];state.notice=locks[teacherId]?`Teacher show locked on Recital ${recital}.`:`Teacher show unlocked on Recital ${recital}.`;render();return;}
    if(event.target.closest("[data-stage-clear-filters]")){state.filters={teacher:"",school:"",requirement:""};render();return;}
    const teacherFilter=event.target.closest("[data-stage-teacher]");if(teacherFilter){state.filters.teacher=teacherFilter.dataset.stageTeacher;render();return;}
    const boardTeacher=event.target.closest("[data-stage-board-teacher]");if(boardTeacher){state.boardTeacher=boardTeacher.dataset.stageBoardTeacher;render();return;}
    if(event.target.closest("[data-stage-add-routine]")){const load=teacherLoad().find((item)=>item.id===state.boardTeacher),number=state.groups.filter((group)=>group.emptyForTeacher===state.boardTeacher||group.classes.some((item)=>item.teacherId===state.boardTeacher)).length+1;state.groups.push({id:crypto.randomUUID(),name:`${load?.name||"Teacher"} · New Routine ${number}`,requirement:"either",relationship:"separate",quality:"possible",decision:"modified",owner:"shared",teacherIds:[state.boardTeacher],crossTeacher:false,classes:[],stageSets:[],analysis:{reasons:[]},emptyForTeacher:state.boardTeacher});state.notice="New routine row added. Drag a class into it when you are ready.";render();return;}
    const removeRoutine=event.target.closest("[data-stage-remove-routine]");if(removeRoutine){const group=state.groups.find((item)=>item.id===removeRoutine.dataset.stageRemoveRoutine),teacherClasses=group?.classes.filter((item)=>item.teacherId===state.boardTeacher)||[];if(!group)return;if(teacherClasses.length){state.notice="Move every class out of this routine before removing it.";render();return;}state.groups=state.groups.filter((item)=>item!==group);state.notice="Empty routine removed.";render();return;}
    if(event.target.closest("[data-stage-add-show]")){const used=new Set(state.classes.filter((item)=>item.teacherId===state.boardTeacher).map((item)=>showForSchool(item.school)).filter(Boolean)),number=[1,2,3,4].find((candidate)=>!used.has(candidate));if(!number){state.notice="All four teacher-show toppers are already in the planner.";render();return;}state.pendingShows[state.boardTeacher]=number;state.notice=`Show ${number} is ready. Drag its topper onto a school.`;render();return;}
    const combine=event.target.closest("[data-stage-combine-class]");if(combine){const group=state.groups.find((item)=>item.classes.some((candidate)=>candidate.id===combine.dataset.stageCombineClass));if(group)await combineBoardClasses(group,combine.dataset.stageCombineClass);return;}
    const uncombine=event.target.closest("[data-stage-uncombine-class]");if(uncombine){const group=state.groups.find((item)=>item.classes.some((candidate)=>candidate.id===uncombine.dataset.stageUncombineClass)),set=group?.stageSets.find((items)=>items.length>1&&items.some((item)=>item.id===uncombine.dataset.stageUncombineClass));if(group&&set){group.stageSets=group.stageSets.filter((items)=>items!==set);set.forEach((item)=>group.stageSets.push([item]));refreshBoardGroup(group);await persistGroup(group);state.notice="The classes are separate again and can be dragged individually.";render();}return;}
    if(event.target.closest("[data-stage-recalculate]")){await initialize(true);return;}
    if(event.target.closest("[data-stage-build-shows]")){buildShows(true);state.view="show";render();return;}
    const card=event.target.closest("[data-stage-group]");if(!card)return;const group=state.groups.find((item)=>item.id===card.dataset.stageGroup);if(!group)return;
    if(event.target.closest("[data-stage-link-shows]")){group.showsLinked=!group.showsLinked;state.notice=group.showsLinked?`${group.classes.map((item,index)=>`${item.teacher} Show ${group.teacherShows?.[index]||state.schoolShows[`${item.teacherId}::${item.school}`]||state.showPlan?.classShow?.[item.id]||"?"}`).join(" + ")} linked for the same recital.`:"The teacher shows are no longer linked.";render();return;}
    if(event.target.closest("[data-stage-approve]")){if(hasSchoolConflict(group.classes)){state.notice="Two classes at the same school cannot perform the same routine.";render();return;}if(String(group.id).startsWith("cross-"))group.id=crypto.randomUUID();group.decision="approved";await persistGroup(group);state.notice=`${group.name} approved.`;render();}
    if(event.target.closest("[data-stage-lock]")){if(hasSchoolConflict(group.classes)){state.notice="Two classes at the same school cannot perform the same routine.";render();return;}if(String(group.id).startsWith("cross-"))group.id=crypto.randomUUID();group.decision="locked";await persistGroup(group);state.notice=`${group.name} locked. Recalculation will preserve it.`;render();}
    if(event.target.closest("[data-stage-reject]")){group.decision="rejected";group.relationship="separate";if(!String(group.id).startsWith("cross-"))await persistGroup(group);state.notice=`${group.name} will stay separate.`;render();}
  });
  document.addEventListener("dragstart",(event)=>{const showTopper=event.target.closest("[data-stage-unplaced-show]");if(showTopper){state.draggedShow=Number(showTopper.dataset.stageUnplacedShow);event.dataTransfer?.setData("text/show-number",String(state.draggedShow));if(event.dataTransfer)event.dataTransfer.effectAllowed="move";showTopper.classList.add("is-dragging");return;}const schoolHeader=event.target.closest("[data-stage-school-header][draggable='true']");if(schoolHeader){state.draggedSchool=schoolHeader.dataset.stageSchoolHeader;event.dataTransfer?.setData("text/school",state.draggedSchool);if(event.dataTransfer)event.dataTransfer.effectAllowed="move";schoolHeader.classList.add("is-dragging");return;}if(event.target.closest(".stage-board-dancers")||event.target.closest(".stage-combine-toggle")){event.preventDefault();return;}const showHandle=event.target.closest("[data-stage-class-show-handle]"),card=event.target.closest("[data-stage-board-class][draggable='true']");if(!card)return;state.draggedByShowHandle=Boolean(showHandle);state.draggedClass=card.dataset.stageBoardClass;const source=state.groups.find((group)=>group.classes.some((item)=>item.id===state.draggedClass)),combined=source?.stageSets.find((set)=>set.length>1&&set.some((item)=>item.id===state.draggedClass));state.draggedClasses=combined?combined.map((item)=>item.id):[state.draggedClass];document.querySelectorAll("[data-stage-board-class]").forEach((item)=>{if(state.draggedClasses.includes(item.dataset.stageBoardClass))item.classList.add("is-dragging");});event.dataTransfer?.setData("text/plain",state.draggedClass);if(event.dataTransfer)event.dataTransfer.effectAllowed="move";});
  document.addEventListener("dragend",()=>{document.querySelectorAll(".is-dragging,.is-drag-target,.is-show-drop-target").forEach((item)=>item.classList.remove("is-dragging","is-drag-target","is-show-drop-target"));state.draggedClass="";state.draggedClasses=[];state.draggedSchool="";state.draggedShow=0;state.draggedByShowHandle=false;});
  document.addEventListener("pointerdown",(event)=>{const handle=event.target.closest("[data-stage-show-resize]"),band=handle?.closest("[data-stage-show-band]");if(!handle||!band||!band.dataset.stageShowBand)return;event.preventDefault();rememberPlannerState();const matrix=band.closest(".stage-routine-matrix"),headers=[...matrix.querySelectorAll(".stage-routine-column-heads>div")].slice(1),schools=orderedBoardSchools([...new Set(state.classes.filter((item)=>item.teacherId===state.boardTeacher).map((item)=>item.school))],state.groups.filter((group)=>group.decision!=="rejected"&&group.classes.some((item)=>item.teacherId===state.boardTeacher)&&!group.crossTeacher));const show=Number(band.dataset.stageShowBand),start=Number(band.dataset.stageBandStart),end=start+Number(band.dataset.stageBandSpan)-1,edge=handle.dataset.stageShowResize;handle.setPointerCapture?.(event.pointerId);band.classList.add("is-resizing");const finish=(upEvent)=>{const centers=headers.map((header)=>{const rect=header.getBoundingClientRect();return rect.left+rect.width/2;}),nearest=centers.reduce((best,center,index)=>Math.abs(center-upEvent.clientX)<Math.abs(centers[best]-upEvent.clientX)?index:best,0),nextStart=edge==="start"?Math.min(nearest,end):start,nextEnd=edge==="end"?Math.max(nearest,start):end;schools.forEach((school,index)=>{const was=index>=start&&index<=end,isNow=index>=nextStart&&index<=nextEnd;if(isNow)setSchoolShow(school,show);else if(was&&showForSchool(school)===show)setSchoolShow(school,null);});handle.releasePointerCapture?.(upEvent.pointerId);handle.removeEventListener("pointerup",finish);handle.removeEventListener("pointercancel",finish);state.notice=`Show ${show} now includes ${nextEnd-nextStart+1} school${nextEnd-nextStart===0?"":"s"}.`;render();};handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",finish);});
  document.addEventListener("dragover",(event)=>{const slot=event.target.closest("[data-stage-drop-group]");if(!slot||!state.draggedClass||state.draggedByShowHandle)return;event.preventDefault();slot.classList.add("is-drag-target");if(event.dataTransfer)event.dataTransfer.dropEffect="move";});
  document.addEventListener("dragover",(event)=>{const band=event.target.closest("[data-stage-show-band],[data-stage-unplaced-show]");if(!band||!(band.dataset.stageShowBand||band.dataset.stageUnplacedShow)||(!state.draggedSchool&&!state.draggedClass))return;event.preventDefault();band.classList.add("is-show-drop-target");if(event.dataTransfer)event.dataTransfer.dropEffect="move";});
  document.addEventListener("dragleave",(event)=>event.target.closest("[data-stage-show-band],[data-stage-unplaced-show]")?.classList.remove("is-show-drop-target"));
  document.addEventListener("drop",async(event)=>{const band=event.target.closest("[data-stage-show-band],[data-stage-unplaced-show]");if(!band||!(band.dataset.stageShowBand||band.dataset.stageUnplacedShow)||(!state.draggedSchool&&!state.draggedClass))return;event.preventDefault();const show=Number(band.dataset.stageShowBand||band.dataset.stageUnplacedShow),wasPending=Boolean(band.dataset.stageUnplacedShow);if(state.draggedSchool){const school=state.draggedSchool,linked=linkedCombinedSchools(school);setSchoolShow(school,show);if(wasPending)delete state.pendingShows[state.boardTeacher];state.draggedSchool="";state.notice=linked.length>1?`${linked.join(" + ")} moved together to Show ${show} because their classes share the stage.`:`${school} moved to Show ${show}.`;render();return;}const classIds=state.draggedClasses.length?state.draggedClasses:[state.draggedClass],items=classIds.map((id)=>state.classes.find((item)=>item.id===id)).filter(Boolean);if(!items.length)return;if(items.length>1){setSchoolShow(items[0].school,show);if(wasPending)delete state.pendingShows[state.boardTeacher];const affected=state.groups.filter((group)=>group.classes.some((item)=>classIds.includes(item.id)));await Promise.all(affected.map(persistGroup));state.draggedClass="";state.draggedClasses=[];state.notice=`${[...new Set(items.map((item)=>item.school))].join(" + ")} moved together under Show ${show}.`;render();return;}const label=`${items[0].name} from ${items[0].school}`;if(!window.confirm(`Separate ${label} from the rest of the school?`)){state.notice="The class stayed with the rest of its school.";render();return;}if(siblingSplitFor(classIds,show)){window.alert("Denied: Siblings can not be on more than 1 Show.");state.notice="Denied: Siblings can not be on more than 1 Show.";render();return;}classIds.forEach((id)=>setClassShow(id,show));if(wasPending)delete state.pendingShows[state.boardTeacher];const affected=state.groups.filter((group)=>group.classes.some((item)=>classIds.includes(item.id)));await Promise.all(affected.map(persistGroup));state.draggedClass="";state.draggedClasses=[];state.notice=`${items.map((item)=>item.name).join(" + ")} separated from the rest of ${items[0].school} and moved to Show ${show}.`;render();});
  document.addEventListener("dragover",(event)=>{const school=event.target.closest("[data-stage-school-header]");if(!school||!state.draggedShow)return;event.preventDefault();school.classList.add("is-show-drop-target");if(event.dataTransfer)event.dataTransfer.dropEffect="move";});
  document.addEventListener("dragleave",(event)=>event.target.closest("[data-stage-school-header]")?.classList.remove("is-show-drop-target"));
  document.addEventListener("drop",(event)=>{const schoolHeader=event.target.closest("[data-stage-school-header]");if(!schoolHeader||!state.draggedShow)return;event.preventDefault();const school=schoolHeader.dataset.stageSchoolHeader,show=state.draggedShow;setSchoolShow(school,show);delete state.pendingShows[state.boardTeacher];state.draggedShow=0;state.notice=`${school} placed in Show ${show}. Drag the topper edges to include neighboring schools.`;render();});
  document.addEventListener("dragleave",(event)=>event.target.closest("[data-stage-drop-group]")?.classList.remove("is-drag-target"));
  document.addEventListener("drop",async(event)=>{const slot=event.target.closest("[data-stage-drop-group]");if(!slot||state.draggedByShowHandle)return;event.preventDefault();const classId=state.draggedClass||event.dataTransfer?.getData("text/plain"),source=state.groups.find((group)=>group.classes.some((item)=>item.id===classId)),target=state.groups.find((group)=>group.id===slot.dataset.stageDropGroup),moveIds=state.draggedClasses.length?state.draggedClasses:[classId],items=source?.classes.filter((candidate)=>moveIds.includes(candidate.id))||[];if(!items.length||!source||!target||source===target)return;const conflict=items.find((item)=>target.classes.some((candidate)=>candidate.school===item.school&&!moveIds.includes(candidate.id)));if(conflict){state.notice=`${conflict.school} already has a class in that routine. Classes from the same school must use different choreography.`;render();return;}source.emptyForTeacher=items[0].teacherId;source.classes=source.classes.filter((candidate)=>!moveIds.includes(candidate.id));source.stageSets=source.stageSets.map((set)=>set.filter((candidate)=>!moveIds.includes(candidate.id))).filter((set)=>set.length);target.classes.push(...items);target.stageSets.push(items);refreshBoardGroup(source);refreshBoardGroup(target);await Promise.all([persistGroup(source),persistGroup(target)]);state.notice=items.length>1?`Combined classes moved together to ${target.name}.`:`${items[0].school} · ${items[0].name} moved to ${target.name}.`;render();});
  document.addEventListener("toggle",(event)=>{const details=event.target.closest?.(".stage-board-dancers");if(!details||syncingDancerDetails)return;const row=details.closest(".stage-routine-row[data-stage-group]"),card=details.closest("[data-stage-board-class]"),group=state.groups.find((item)=>item.id===row?.dataset.stageGroup),source=group?.classes.find((item)=>item.id===card?.dataset.stageBoardClass);if(!row||!source)return;const show=showForSchool(source.school);if(!show)return;syncingDancerDetails=true;row.querySelectorAll(".stage-board-dancers").forEach((other)=>{const otherCard=other.closest("[data-stage-board-class]"),otherClass=group.classes.find((item)=>item.id===otherCard?.dataset.stageBoardClass);if(otherClass&&showForSchool(otherClass.school)===show)other.open=details.open;});syncingDancerDetails=false;},true);
  document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&state.fullscreen){state.fullscreen=false;render();}});
  document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&state.fullscreen){state.fullscreen=false;render();}});
  window.renderBigStage=()=>initialize(false);
  initialize(false);
})();
