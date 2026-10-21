/* Shared storage only. No sample records and no automatic writes. */
window.DTAttendanceStorage = (() => {
  const requireClient = client => {
    if (!client?.from || !client?.rpc) throw new Error('Sign in before saving attendance.');
    return client;
  };
  async function loadClassAttendance(client) {
    requireClient(client);
    const rows = [], size = 500;
    let after = null;
    for (;;) {
      let query = client.from('class_attendance_records')
        .select('id,dance_class_id,student_id,attendance_date,status,check_in_at,check_out_at,updated_at')
        .order('id', {ascending:true}).limit(size);
      if (after) query = query.gt('id', after);
      const {data,error} = await query;
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < size) return {data:rows,error:null};
      const next = page.at(-1).id;
      if (!next || next === after) throw new Error('Attendance loading did not advance. Please refresh.');
      after = next;
    }
  }
  async function history(client, studentId) {
    requireClient(client);
    const rows = [], size = 100;
    for (let offset=0;;offset+=size) {
      const {data,error} = await client.rpc('student_attendance_history', {
        target_student_id:studentId,page_offset:offset,page_size:size
      });
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < size) return rows;
    }
  }
  async function saveKnownAbsence(client, {studentId,date,note,revision=0,canceled=false}) {
    requireClient(client);
    const {data,error} = await client.rpc('save_student_known_absence', {
      target_student_id:studentId,target_date:date,absence_note:note,
      expected_revision:revision,cancel_absence:canceled
    });
    if (error) throw error;
    if (!data) throw new Error('The absence was not saved. Please try again.');
    return data;
  }
  async function correctStatus(client, record, status) {
    requireClient(client);
    const {data,error} = await client.rpc('correct_student_attendance_status', {
      target_record_id:record.record_id,new_status:status,expected_updated_at:record.updated_at
    });
    if (error) throw error;
    if (!data) throw new Error('The attendance correction was not saved. Please try again.');
    return data;
  }
  async function loadWorkspace(client,date) {
    requireClient(client);
    const absenceRows=[];let after=null;
    for(;;){let q=client.from('student_known_absences').select('*').gte('absence_date',date).order('id').limit(500);if(after)q=q.gt('id',after);const {data,error}=await q;if(error)throw error;absenceRows.push(...(data||[]));if((data||[]).length<500)break;after=data.at(-1).id;}
    const a={data:absenceRows},d=await client.from('combined_dance_days').select('*').eq('attendance_date',date);
    if(a.error)throw a.error;if(d.error)throw d.error;
    return {absences:(a.data||[]).map(a=>({id:a.id,studentId:a.student_id,date:String(a.absence_date).slice(0,10),note:a.note,revision:a.revision,canceled:Boolean(a.canceled_at)})),days:d.data||[]};
  }
  async function saveDay(client,schoolId,date,revision,payload){
    requireClient(client);
    const {data,error}=await client.rpc('save_combined_dance_day',{target_school:schoolId,target_date:date,expected_revision:revision,day_payload:payload});
    if(error)throw error;if(!data)throw new Error('The combined day was not saved.');return data;
  }
  async function correctStatuses(client,changes){
    requireClient(client);const {data,error}=await client.rpc('correct_student_attendance_batch',{corrections:changes.map(({record,status,sessionId})=>({record_id:record.record_id,status,updated_at:record.updated_at,session_id:sessionId||null}))});
    if(error)throw error;if(!Array.isArray(data)||data.length!==changes.length)throw new Error('Attendance corrections were not fully saved.');return data;
  }
  return {loadClassAttendance,history,saveKnownAbsence,correctStatus,correctStatuses,loadWorkspace,saveDay};
})();
