(() => {
  const SEASON = "2027";
  const STAGE_CAP = 12;
  const state = { section: "shows", view: "teacher", loading: false, groups: [], classes: [], persisted: false, showPlan: null, notice: "", productionShow: "" };
  const productionShows = [
    { id:"s9", time:"9:00 AM", drop:"8:20 AM", schools:3, dancers:48, ready:88, performances:3 },
    { id:"s1130", time:"11:30 AM", drop:"10:50 AM", schools:4, dancers:61, ready:76, performances:1 },
    { id:"s230", time:"2:30 PM", drop:"1:50 PM", schools:4, dancers:57, ready:64, performances:0 },
    { id:"s445", time:"4:45 PM", drop:"4:05 PM", schools:3, dancers:43, ready:52, performances:0 }
  ];
  const root = () => document.getElementById("big-stage-app");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
  const title = (value) => String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());
  const activeRosterClasses = () => typeof rosterClasses === "undefined" ? [] : rosterClasses.filter((item) => item.sourceActive !== false);
  const teacherName = (id) => typeof rosterTeacherName === "function" ? rosterTeacherName(id) : "Teacher";
  const enrolled = (item) => (item.students || []).filter((student) => student.status === "enrolled");
  const fullName = (student) => [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ").trim();
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
  const requirementFor = (item) => ["ballet", "tap", "either"].includes(String(item.recitalPerformance || "").toLowerCase()) ? String(item.recitalPerformance).toLowerCase() : "either";
  const classRecord = (item) => {
    const students = enrolled(item);
    const ages = students.map((student) => monthsOld(student.birthdate)).filter(Number.isFinite).sort((a,b) => a-b);
    const related = students.flatMap((student) => String(student.relatedDancerName || "").split(" • ").map((name) => name.trim()).filter(Boolean));
    return {
      id: String(item.id), source: item, name: item.name || "Class", school: item.schoolName || "School",
      teacherId: String(item.teacherId || ""), teacher: teacherName(item.teacherId), requirement: requirementFor(item),
      level: Number(item.level || 1), count: students.length, students, related,
      minAge: ages[0] ?? null, maxAge: ages.at(-1) ?? null, avgAge: ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null,
      ageData: ages.length, day: item.day || "", time: item.time || ""
    };
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
  const crossTeacherSuggestions = (classes) => {
    const eligible = classes.filter((item)=>(item.maxAge ?? 999)<=42 && item.count>0 && item.count<=7).sort((a,b)=>(a.avgAge??999)-(b.avgAge??999));
    const used = new Set(), suggestions=[];
    eligible.forEach((seed) => {
      if (used.has(seed.id)) return;
      const matches = eligible.filter((item)=>item.id!==seed.id&&!used.has(item.id)&&item.teacherId!==seed.teacherId&&pairScore(seed,item,true)>=72);
      const candidates=[seed,...matches].sort((a,b)=>a.count-b.count);
      const sets=bestCombineSets(candidates); const best=sets.find((set)=>new Set(set.map((x)=>x.teacherId)).size>1&&set.length>1);
      if (!best) return;
      best.forEach((item)=>used.add(item.id));
      suggestions.push({ id:`cross-${crypto.randomUUID()}`, name:`Cross-Teacher · ${title(seed.requirement)} Young Dancers`, requirement:seed.requirement, relationship:"combine", quality:qualityFor(best), decision:"suggested", owner:"shared", teacherIds:[...new Set(best.map((x)=>x.teacherId))], crossTeacher:true, classes:best, stageSets:[best], analysis:analysisFor(best,true) });
    });
    return suggestions;
  };
  const snapshot = (item) => ({ name:item.name, school:item.school, teacher:item.teacher, count:item.count, minAge:item.minAge, maxAge:item.maxAge, requirement:item.requirement });
  const loadPersisted = async () => {
    if (!window.dtSupabase || !["admin","director"].includes(window.dtCurrentProfile?.role || "")) return [];
    const { data, error } = await window.dtSupabase.from("recital_routine_groups").select("*,recital_routine_group_classes(*)").eq("season",SEASON).neq("decision_state","rejected");
    if (error) { console.error("Big Stage plans could not load",error); return []; }
    return (data||[]).map((row)=>{
      const links=row.recital_routine_group_classes||[];
      const linkedClasses=links.map((link)=>state.classes.find((item)=>item.id===String(link.dance_class_id))).filter(Boolean);
      const stageKeys=[...new Set(links.map((link)=>link.stage_group_key||link.dance_class_id))];
      return { id:row.id,name:row.name,requirement:row.recital_requirement,relationship:row.relationship_type,quality:row.match_quality,decision:row.decision_state,owner:row.routine_owner_type,teacherIds:[...new Set(linkedClasses.map((item)=>item.teacherId))],crossTeacher:row.cross_teacher,classes:linkedClasses,stageSets:stageKeys.map((key)=>links.filter((link)=>(link.stage_group_key||link.dance_class_id)===key).map((link)=>state.classes.find((item)=>item.id===String(link.dance_class_id))).filter(Boolean)),analysis:row.analysis||analysisFor(linkedClasses),links};
    }).filter((group)=>group.classes.length);
  };
  const persistGroup = async (group) => {
    if (!window.dtSupabase || String(group.id).startsWith("cross-") && group.decision==="suggested") return;
    const payload={ id:group.id,season:SEASON,name:group.name,recital_requirement:group.requirement,relationship_type:group.relationship,match_quality:group.quality,decision_state:group.decision,routine_owner_type:group.owner,cross_teacher:group.crossTeacher,analysis:group.analysis,created_by:window.dtCurrentProfile?.id||null };
    const { error }=await window.dtSupabase.from("recital_routine_groups").upsert(payload);
    if(error){ console.error(error); state.notice="That recital decision could not be saved."; return; }
    await window.dtSupabase.from("recital_routine_group_classes").delete().eq("group_id",group.id);
    const links=group.stageSets.flatMap((set,setIndex)=>set.map((item)=>({group_id:group.id,dance_class_id:item.id,stage_group_key:`${group.id}-${setIndex+1}`,show_number:group.showAssignments?.[item.id]||null,class_snapshot:snapshot(item)})));
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
  const teacherLoad = () => {
    const map=new Map();
    state.classes.forEach((item)=>{if(!map.has(item.teacherId))map.set(item.teacherId,{id:item.teacherId,name:item.teacher,classes:0,groups:new Set()});map.get(item.teacherId).classes+=1;});
    state.groups.filter((group)=>group.decision!=="rejected").forEach((group)=>group.teacherIds.forEach((id)=>map.get(id)?.groups.add(group.id)));
    return [...map.values()].map((item)=>({...item,routines:item.groups.size,status:item.groups.size<4?"Under Target":item.groups.size<=6?"Ideal — 4–6":"Above Target"})).sort((a,b)=>a.name.localeCompare(b.name));
  };
  const groupCard = (group) => {
    const total=group.classes.reduce((sum,item)=>sum+item.count,0), spread=ageSpread(group.classes);
    const relationLabel=group.relationship==="combine"?(group.crossTeacher?"Cross-Teacher Combine Suggested":"Combine Suggested"):group.relationship==="share"?"Share Choreography":"Keep Separate";
    return `<article class="stage-match-card ${group.crossTeacher?"cross-teacher":""}" data-stage-group="${esc(group.id)}">
      <div class="stage-match-head"><div><span class="stage-status ${group.quality}">${esc(title(group.quality))} Match</span><h5>${esc(group.name)}</h5><p>${esc(relationLabel)} · ${total} dancer${total===1?"":"s"}${spread==null?"":` · ${spread}-month age span`}</p></div><span class="stage-decision ${group.decision}">${esc(title(group.decision))}</span></div>
      <div class="stage-class-list">${group.classes.map((item)=>`<div class="stage-class-row"><span><strong>${esc(item.school)} · ${esc(item.name)}</strong><small>${esc(item.teacher)} · ${item.count} dancers · ${item.ageData?`${item.minAge}–${item.maxAge} months`:`Birthdates needed`}</small></span><span>${esc(title(item.requirement))}</span></div>`).join("")}</div>
      <div class="stage-reasons">${(group.analysis.reasons||[]).map((reason)=>`<span>✓ ${esc(reason)}</span>`).join("")}</div>
      ${group.stageSets.length>1?`<div class="stage-combine-plan"><strong>Efficient stage plan</strong>${group.stageSets.map((set,index)=>`<span>Number ${index+1}: ${set.map((item)=>esc(item.school)).join(" + ")} · ${set.reduce((sum,item)=>sum+item.count,0)} dancers</span>`).join("")}</div>`:""}
      <div class="stage-card-actions"><label>Plan<select data-stage-relation><option value="combine" ${group.relationship==="combine"?"selected":""}>Combine & Perform Together</option><option value="share" ${group.relationship==="share"?"selected":""}>Share Choreography — Perform Separately</option><option value="separate" ${group.relationship==="separate"?"selected":""}>Keep Separate</option></select></label><label>Routine Owner<select data-stage-owner><option value="lead_teacher" ${group.owner==="lead_teacher"?"selected":""}>Lead Teacher / Choreographer</option><option value="shared" ${group.owner==="shared"?"selected":""}>Shared Choreography</option><option value="dt_standard" ${group.owner==="dt_standard"?"selected":""}>DT Standard Routine</option></select></label><button class="primary" data-stage-approve>${group.decision==="approved"?"Approved ✓":"Approve"}</button><button class="secondary" data-stage-lock>${group.decision==="locked"?"Locked 🔒":"Lock"}</button><button class="secondary" data-stage-reject>Keep Separate</button></div>
    </article>`;
  };
  const teacherView = () => `<div class="stage-load-grid">${teacherLoad().map((item)=>`<button class="stage-load-card ${item.status.startsWith("Above")?"above":item.status.startsWith("Ideal")?"ideal":"under"}" data-stage-teacher="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${item.classes} Classes</span><b>${item.routines} Unique Recital Dances</b><small>${esc(item.status)}</small></button>`).join("")}</div><div class="stage-match-grid">${state.groups.filter((group)=>!group.crossTeacher).map(groupCard).join("")}</div>${state.groups.some((group)=>group.crossTeacher)?`<section class="stage-cross-section"><h4>Cross-Teacher Young-Class Opportunities</h4><p>Exceptions only. Every suggestion requires director approval.</p><div class="stage-match-grid">${state.groups.filter((group)=>group.crossTeacher).map(groupCard).join("")}</div></section>`:""}`;
  const schoolView = () => {
    const schools=[...new Set(state.classes.map((item)=>item.school))].sort();
    return `<div class="stage-school-grid">${schools.map((school)=>{const classes=state.classes.filter((item)=>item.school===school);const groups=state.groups.filter((group)=>group.classes.some((item)=>item.school===school));const shows=[...new Set(groups.flatMap((group)=>Object.values(group.showAssignments||{})))].filter(Boolean);const siblingCount=classes.flatMap((item)=>item.related).length;return `<article class="stage-school-card"><h5>${esc(school)}</h5><p>${classes.length} classes · ${classes.reduce((sum,item)=>sum+item.count,0)} dancers</p><div>${classes.map((item)=>`<span>${esc(item.name)} · ${esc(item.teacher)} · ${item.count}</span>`).join("")}</div><small>${groups.length} routine group${groups.length===1?"":"s"} · ${siblingCount} sibling link${siblingCount===1?"":"s"}${shows.length?` · Proposed Show ${shows.join(", ")}`:""}</small></article>`;}).join("")}</div>`;
  };
  const routineView = () => `<div class="stage-match-grid">${[...state.groups].sort((a,b)=>b.classes.length-a.classes.length).map(groupCard).join("")}</div>`;
  const siblingComponents = () => {
    const byName=new Map();state.classes.forEach((item)=>item.students.forEach((student)=>byName.set(fullName(student).toLowerCase(),item)));
    const edges=[];state.classes.forEach((item)=>item.students.forEach((student)=>String(student.relatedDancerName||"").split(" • ").map((name)=>name.trim().toLowerCase()).filter(Boolean).forEach((name)=>{const other=byName.get(name);if(other&&other.id!==item.id)edges.push([item.id,other.id]);})));
    return edges;
  };
  const buildShows = () => {
    const shows=[1,2,3,4].map((number)=>({number,units:[],dancers:0,schools:new Set(),teachers:new Set(),styles:{ballet:0,tap:0,either:0}}));
    const classShow={}, schoolShow=new Map(), siblingEdges=siblingComponents();
    const groups=state.groups.filter((group)=>group.decision!=="rejected");
    groups.sort((a,b)=>b.classes.reduce((s,x)=>s+x.count,0)-a.classes.reduce((s,x)=>s+x.count,0));
    groups.forEach((group)=>group.stageSets.forEach((set,setIndex)=>{
      const schools=[...new Set(set.map((item)=>item.school))];
      const forced=[...new Set([...schools.map((school)=>schoolShow.get(school)),...set.flatMap((item)=>siblingEdges.filter((edge)=>edge.includes(item.id)).flatMap((edge)=>edge.map((id)=>classShow[id])))].filter(Boolean))];
      const candidates=forced.length===1?shows.filter((show)=>show.number===forced[0]):shows;
      const sameRoutineShows=new Set(group.stageSets.slice(0,setIndex).flatMap((prior)=>prior.map((item)=>classShow[item.id])).filter(Boolean));
      const chosen=[...candidates].sort((a,b)=>(sameRoutineShows.has(a.number)-sameRoutineShows.has(b.number))||(a.dancers-b.dancers)||(a.units.length-b.units.length))[0];
      const dancers=set.reduce((sum,item)=>sum+item.count,0);chosen.units.push({group,set});chosen.dancers+=dancers;chosen.styles[group.requirement]=(chosen.styles[group.requirement]||0)+1;set.forEach((item)=>{classShow[item.id]=chosen.number;chosen.schools.add(item.school);chosen.teachers.add(item.teacher);if(!schoolShow.has(item.school))schoolShow.set(item.school,chosen.number);});
    }));
    state.groups.forEach((group)=>{group.showAssignments={};group.classes.forEach((item)=>{group.showAssignments[item.id]=classShow[item.id];});});
    state.showPlan={shows,classShow};state.notice="Four provisional shows built after routine grouping. Review warnings before approval.";
    state.groups.filter((group)=>["approved","modified","locked"].includes(group.decision)).forEach(persistGroup);
  };
  const showView = () => {
    if(!state.showPlan)return `<div class="stage-empty"><h4>Match routines first, then build the four shows.</h4><p>Show assignment is intentionally an output of recital matching—not an input.</p><button class="primary" data-stage-build-shows>Build Four Suggested Shows</button></div>`;
    return `<div class="stage-show-board">${state.showPlan.shows.map((show)=>`<section class="stage-show-column"><h4>Show ${show.number}</h4><div class="stage-show-metrics"><span>${show.units.length} numbers</span><span>${show.dancers} dancers</span><span>${show.schools.size} schools</span></div>${show.units.map(({group,set})=>`<article><strong>${esc(group.name)}</strong><small>${set.map((item)=>esc(item.school)).join(" + ")}</small><span>${set.reduce((sum,item)=>sum+item.count,0)} dancers · ${esc(title(group.requirement))}</span></article>`).join("")}</section>`).join("")}</div><div class="stage-warning-panel"><strong>Scheduling checks</strong>${siblingComponents().every(([a,b])=>state.showPlan.classShow[a]===state.showPlan.classShow[b])?`<span>✓ Siblings remain in the same show</span>`:`<span class="warning">! A sibling dependency needs director review</span>`}${state.showPlan.shows.map((show)=>`<span>Show ${show.number}: ${show.dancers} dancers · ${show.units.length} recital numbers</span>`).join("")}</div>`;
  };
  const productionView = () => {
    const selected=productionShows.find((show)=>show.id===state.productionShow);
    if(selected)return `<div class="big-stage-view-title"><button class="secondary" data-stage-production-back>← All Shows</button><div><h4>${esc(selected.time)} Show</h4><p>Saturday, May 22, 2027 · Drop-off ${esc(selected.drop)}</p></div></div><div class="big-stage-toolbar"><div><strong>Performance Flow Order</strong><p>${selected.performances} performances · ${selected.dancers} dancers</p></div><div class="big-stage-actions"><button class="secondary" type="button">Preview Newsletter</button><button class="primary" type="button">+ Assign a Class</button></div></div><div class="stage-empty"><h4>Show production stays right here.</h4><p>Flow order, songs, costumes, props, participation, and family communication remain separate from Recital Matching.</p></div>`;
    return `<div class="big-stage-toolbar"><div><h4>2027 Dance Techniques Recital</h4><p>Saturday, May 22 · Wylie High School Auditorium</p></div><div class="big-stage-actions"><button class="secondary" type="button">+ Create Recital Newsletter</button><button class="primary" type="button">+ Add Show</button></div></div><div class="big-stage-show-grid">${productionShows.map((show)=>`<button class="big-stage-show-card" data-stage-production-show="${show.id}"><div class="big-stage-show-top"><div><div class="big-stage-show-time">${esc(show.time)}</div><div class="big-stage-show-date">Saturday, May 22, 2027</div></div><span class="big-stage-pill">${show.ready}% planned</span></div><div>Wylie High School Auditorium<br><small>Student drop-off · ${esc(show.drop)}</small></div><div class="big-stage-show-meta"><div class="big-stage-stat"><strong>${show.schools}</strong><small>Schools</small></div><div class="big-stage-stat"><strong>${show.performances}</strong><small>Performances</small></div><div class="big-stage-stat"><strong>${show.dancers}</strong><small>Dancers</small></div></div><div class="big-stage-progress"><span style="width:${show.ready}%"></span></div></button>`).join("")}</div><div class="big-stage-note"><strong>Show Production</strong> is where approved recital groups become flow order, songs, costumes, props, and family communication.</div>`;
  };
  const render = () => {
    if(!root())return;
    const body=state.view==="teacher"?teacherView():state.view==="school"?schoolView():state.view==="routine"?routineView():showView();
    const matching=`<div class="stage-master-toolbar"><div><h4>2027 Recital Matching</h4><p>Match choreography first. Build four mirrored shows second.</p></div><div class="big-stage-actions"><button class="secondary" data-stage-recalculate>Recalculate Suggestions</button>${state.view!=="show"?`<button class="primary" data-stage-build-shows>Build Four Shows</button>`:""}</div></div>${state.notice?`<div class="big-stage-note">${esc(state.notice)}</div>`:""}<nav class="stage-view-tabs" aria-label="Recital planning views">${[["teacher","Teacher View"],["school","School View"],["routine","Routine View"],["show","Show View"]].map(([key,label])=>`<button data-stage-view="${key}" aria-pressed="${state.view===key}">${label}</button>`).join("")}</nav>${state.loading?`<div class="stage-empty">Analyzing current classes, ages, recital needs, and family links…</div>`:body}`;
    root().innerHTML=`<div class="big-stage-shell"><nav class="stage-section-toggle" aria-label="The Big Stage sections"><button data-stage-section="shows" aria-pressed="${state.section==="shows"}">Show Production</button><button data-stage-section="matching" aria-pressed="${state.section==="matching"}">Recital Matching</button></nav>${state.section==="shows"?productionView():matching}</div>`;
  };
  const initialize = async (force=false) => {
    if(state.loading)return;state.loading=true;render();
    state.classes=activeRosterClasses().map(classRecord).filter((item)=>item.id);
    const persisted=force?state.groups.filter((group)=>["approved","modified","locked"].includes(group.decision)):await loadPersisted();
    const generated=generatedGroups(state.classes);const assigned=new Set(generated.flatMap((group)=>group.classes.map((item)=>item.id)));
    const cross=crossTeacherSuggestions(state.classes.filter((item)=>assigned.has(item.id)));
    state.groups=enforceUniqueRoutinePerSchool(mergePlans([...generated,...cross],persisted));state.persisted=true;state.loading=false;
    const adjusted=state.groups.some((group)=>group.schoolRuleAdjusted);
    state.notice=adjusted?"Classes at the same school were separated into different routines.":force?"Suggestions recalculated. Approved, modified, and locked decisions were preserved.":`${state.classes.length} active classes analyzed. No show assignments have been made yet.`;render();
  };
  document.addEventListener("change", async (event) => {
    const card=event.target.closest("[data-stage-group]");if(!card)return;const group=state.groups.find((item)=>item.id===card.dataset.stageGroup);if(!group)return;
    if(event.target.matches("[data-stage-relation]")){group.relationship=event.target.value;group.decision="modified";group.stageSets=group.relationship==="combine"?[group.classes]:group.classes.map((item)=>[item]);if(group.relationship==="combine"&&group.classes.reduce((sum,item)=>sum+item.count,0)>STAGE_CAP){group.relationship="share";group.stageSets=bestCombineSets(group.classes);state.notice="That full combine exceeds 12 dancers, so it remains shared choreography with safe stage groups.";}await persistGroup(group);render();}
    if(event.target.matches("[data-stage-owner]")){group.owner=event.target.value;group.decision=group.decision==="suggested"?"modified":group.decision;await persistGroup(group);render();}
  });
  document.addEventListener("click", async (event) => {
    const section=event.target.closest("[data-stage-section]");if(section){state.section=section.dataset.stageSection;render();return;}
    const production=event.target.closest("[data-stage-production-show]");if(production){state.productionShow=production.dataset.stageProductionShow;render();return;}
    if(event.target.closest("[data-stage-production-back]")){state.productionShow="";render();return;}
    const view=event.target.closest("[data-stage-view]");if(view){state.view=view.dataset.stageView;render();return;}
    if(event.target.closest("[data-stage-recalculate]")){await initialize(true);return;}
    if(event.target.closest("[data-stage-build-shows]")){buildShows();state.view="show";render();return;}
    const card=event.target.closest("[data-stage-group]");if(!card)return;const group=state.groups.find((item)=>item.id===card.dataset.stageGroup);if(!group)return;
    if(event.target.closest("[data-stage-approve]")){if(hasSchoolConflict(group.classes)){state.notice="Two classes at the same school cannot perform the same routine.";render();return;}if(String(group.id).startsWith("cross-"))group.id=crypto.randomUUID();group.decision="approved";await persistGroup(group);state.notice=`${group.name} approved.`;render();}
    if(event.target.closest("[data-stage-lock]")){if(hasSchoolConflict(group.classes)){state.notice="Two classes at the same school cannot perform the same routine.";render();return;}if(String(group.id).startsWith("cross-"))group.id=crypto.randomUUID();group.decision="locked";await persistGroup(group);state.notice=`${group.name} locked. Recalculation will preserve it.`;render();}
    if(event.target.closest("[data-stage-reject]")){group.decision="rejected";group.relationship="separate";if(!String(group.id).startsWith("cross-"))await persistGroup(group);state.notice=`${group.name} will stay separate.`;render();}
  });
  window.renderBigStage=()=>initialize(false);
  initialize(false);
})();
