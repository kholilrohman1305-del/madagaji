const API_BASE = import.meta.env.VITE_API_BASE || '/pdmada-api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Request failed');
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  students: {
    list: () => request('/api/students'),
    create: (payload) => request('/api/students', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/students/${id}`, { method: 'DELETE' })
  },
  classes: {
    list: () => request('/api/classes'),
    create: (payload) => request('/api/classes', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/classes/${id}`, { method: 'DELETE' })
  },
  schoolYears: {
    list: () => request('/api/school-years'),
    create: (payload) => request('/api/school-years', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/school-years/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/school-years/${id}`, { method: 'DELETE' }),
    activate: (id) => request(`/api/school-years/${id}/activate`, { method: 'POST' })
  },
  semesters: {
    list: () => request('/api/semesters'),
    create: (payload) => request('/api/semesters', { method: 'POST', body: JSON.stringify(payload) }),
    activate: (id) => request(`/api/semesters/${id}/activate`, { method: 'POST' })
  },
  teacherTasks: {
    list: () => request('/api/teacher-tasks'),
    create: (payload) => request('/api/teacher-tasks', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/teacher-tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/teacher-tasks/${id}`, { method: 'DELETE' })
  },
  additionalTasks: {
    list: () => request('/api/additional-tasks'),
    create: (payload) => request('/api/additional-tasks', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/additional-tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/additional-tasks/${id}`, { method: 'DELETE' })
  },
  teachers: {
    list: () => request('/api/teachers'),
    create: (payload) => request('/api/teachers', { method: 'POST', body: JSON.stringify(payload) }),
    bulkUpdate: (payload) => request('/api/teachers/bulk-update', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/teachers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/teachers/${id}`, { method: 'DELETE' })
  },
  subjects: {
    list: () => request('/api/subjects'),
    create: (payload) => request('/api/subjects', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/subjects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/subjects/${id}`, { method: 'DELETE' })
  },
  extracurriculars: {
    list: () => request('/api/extracurriculars'),
    create: (payload) => request('/api/extracurriculars', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/extracurriculars/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/extracurriculars/${id}`, { method: 'DELETE' })
  },
  classSubjectSettings: {
    list: ({ classId, schoolYearId, semesterId } = {}) => {
      const params = new URLSearchParams();
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (semesterId && semesterId !== 'all') params.set('semester_id', String(semesterId));
      const qs = params.toString();
      return request(`/api/class-subject-settings${qs ? `?${qs}` : ''}`);
    },
    upsertPeriod: (payload) => request('/api/class-subject-settings/upsert-period', { method: 'POST', body: JSON.stringify(payload) }),
    copyPeriod: (payload) => request('/api/class-subject-settings/copy-period', { method: 'POST', body: JSON.stringify(payload) }),
    copyFromPrevious: (payload) => request('/api/class-subject-settings/copy-from-previous', { method: 'POST', body: JSON.stringify(payload) })
  },
  pondokPesantren: {
    list: () => request('/api/pondok-pesantren'),
    create: (payload) => request('/api/pondok-pesantren', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/pondok-pesantren/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/pondok-pesantren/${id}`, { method: 'DELETE' })
  },
  bukuInduk: {
    list: ({ classId, schoolYearId, status, q } = {}) => {
      const params = new URLSearchParams();
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (status && status !== 'all') params.set('status', String(status));
      if (q && String(q).trim()) params.set('q', String(q).trim());
      const qs = params.toString();
      return request(`/api/buku-induk${qs ? `?${qs}` : ''}`);
    },
    detail: (studentId) => request(`/api/buku-induk/${studentId}`),
    exportCsvUrl: ({ classId, schoolYearId, status, q } = {}) => {
      const params = new URLSearchParams();
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (status && status !== 'all') params.set('status', String(status));
      if (q && String(q).trim()) params.set('q', String(q).trim());
      const qs = params.toString();
      return `${API_BASE}/api/buku-induk/export/csv${qs ? `?${qs}` : ''}`;
    }
  },
  studentScores: {
    list: ({ studentId, classId, schoolYearId, semesterId, subjectId, q } = {}) => {
      const params = new URLSearchParams();
      if (studentId) params.set('student_id', String(studentId));
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (semesterId && semesterId !== 'all') params.set('semester_id', String(semesterId));
      if (subjectId && subjectId !== 'all') params.set('subject_id', String(subjectId));
      if (q && String(q).trim()) params.set('q', String(q).trim());
      const qs = params.toString();
      return request(`/api/student-scores${qs ? `?${qs}` : ''}`);
    },
    upsert: (payload) => request('/api/student-scores/upsert', { method: 'POST', body: JSON.stringify(payload) }),
    bulkUpsert: (items) => request('/api/student-scores/bulk-upsert', { method: 'POST', body: JSON.stringify({ items }) }),
    remove: (id) => request(`/api/student-scores/${id}`, { method: 'DELETE' }),
    templateUrl: ({ classId, schoolYearId, semesterId }) => {
      const params = new URLSearchParams();
      params.set('class_id', String(classId));
      params.set('school_year_id', String(schoolYearId));
      params.set('semester_id', String(semesterId));
      return `${API_BASE}/api/student-scores/template?${params.toString()}`;
    },
    importXlsx: async ({ classId, schoolYearId, semesterId, file }) => {
      const params = new URLSearchParams();
      params.set('class_id', String(classId));
      params.set('school_year_id', String(schoolYearId));
      params.set('semester_id', String(semesterId));
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/student-scores/import-xlsx?${params.toString()}`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Import nilai gagal');
      }
      return res.json();
    }
  },
  reportCards: {
    list: ({ studentId, classId, schoolYearId, semesterId, q } = {}) => {
      const params = new URLSearchParams();
      if (studentId) params.set('student_id', String(studentId));
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (semesterId && semesterId !== 'all') params.set('semester_id', String(semesterId));
      if (q && String(q).trim()) params.set('q', String(q).trim());
      const qs = params.toString();
      return request(`/api/report-cards${qs ? `?${qs}` : ''}`);
    },
    upsertMeta: (payload) => request('/api/report-cards/meta/upsert', { method: 'POST', body: JSON.stringify(payload) }),
    bulkUpsertMeta: (items) => request('/api/report-cards/meta/bulk-upsert', { method: 'POST', body: JSON.stringify({ items }) })
  },
  recommendations: {
    recommendStudents: ({ category = 'akademik', subjectId, subjectQuery, extracurricularName, classId, schoolYearId, semesterId, limit = 10 } = {}) => {
      const params = new URLSearchParams();
      params.set('category', String(category || 'akademik'));
      if (subjectId) params.set('subject_id', String(subjectId));
      if (!subjectId && subjectQuery && String(subjectQuery).trim()) params.set('subject_q', String(subjectQuery).trim());
      if (extracurricularName && String(extracurricularName).trim()) params.set('extracurricular_name', String(extracurricularName).trim());
      if (classId && classId !== 'all') params.set('class_id', String(classId));
      if (schoolYearId && schoolYearId !== 'all') params.set('school_year_id', String(schoolYearId));
      if (semesterId && semesterId !== 'all') params.set('semester_id', String(semesterId));
      params.set('limit', String(limit || 10));
      return request(`/api/recommendations/students?${params.toString()}`);
    },
    getModel: ({ subjectId }) => request(`/api/recommendations/model?subject_id=${subjectId}`),
    saveFeedback: (payload) => request('/api/recommendations/feedback', { method: 'POST', body: JSON.stringify(payload) })
  },
  schoolSettings: {
    get: () => request('/api/school-settings'),
    save: (payload) => request('/api/school-settings', { method: 'PUT', body: JSON.stringify(payload) })
  },
  uploads: {
    uploadLogo: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/uploads/logo`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Upload logo gagal');
      }
      return res.json();
    },
    uploadDocument: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/uploads/document`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Upload dokumen gagal');
      }
      return res.json();
    }
  },
  users: {
    list: (role = '') => request(`/api/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
    create: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => request(`/api/users/${id}`, { method: 'DELETE' })
  },
  auth: {
    login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) })
  },
  importXlsx: async (entity, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/api/import/${entity}`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Import failed');
    }
    return res.json();
  },
  downloadTemplate: (entity) => `${API_BASE}/api/templates/${entity}`,
  bulkAction: async (entity, action, ids) => {
    const res = await fetch(`${API_BASE}/api/bulk/${entity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Bulk action failed');
    }
    return res.json();
  },
  audit: {
    list: ({ table, since, limit } = {}) => {
      const params = new URLSearchParams();
      if (table) params.set('table', table);
      if (since) params.set('since', since);
      if (limit) params.set('limit', limit);
      const qs = params.toString();
      return request(`/api/audit${qs ? `?${qs}` : ''}`);
    }
  },
  studentAffairs: {
    listPromotionCandidates: (classId) => request(`/api/student-affairs/promotion/candidates?class_id=${classId}`),
    runPromotion: (payload) => request('/api/student-affairs/promotion/run', { method: 'POST', body: JSON.stringify(payload) }),
    rollbackLastPromotion: (payload) => request('/api/student-affairs/promotion/rollback-last', { method: 'POST', body: JSON.stringify(payload) }),
    listMutations: (studentId) => request(`/api/student-affairs/mutations${studentId ? `?student_id=${studentId}` : ''}`),
    createMutation: (payload) => request('/api/student-affairs/mutations', { method: 'POST', body: JSON.stringify(payload) }),
    deleteMutation: (id) => request(`/api/student-affairs/mutations/${id}`, { method: 'DELETE' }),
    listClassHistories: (studentId) => request(`/api/student-affairs/class-histories${studentId ? `?student_id=${studentId}` : ''}`),
    createClassHistory: (payload) => request('/api/student-affairs/class-histories', { method: 'POST', body: JSON.stringify(payload) }),
    deleteClassHistory: (id) => request(`/api/student-affairs/class-histories/${id}`, { method: 'DELETE' }),
    listAchievements: (studentId) => request(`/api/student-affairs/achievements${studentId ? `?student_id=${studentId}` : ''}`),
    createAchievement: (payload) => request('/api/student-affairs/achievements', { method: 'POST', body: JSON.stringify(payload) }),
    updateAchievement: (id, payload) => request(`/api/student-affairs/achievements/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteAchievement: (id) => request(`/api/student-affairs/achievements/${id}`, { method: 'DELETE' }),
    listDocuments: (ownerId, ownerType = 'all') => {
      const params = new URLSearchParams();
      if (ownerType && ownerType !== 'all') params.set('owner_type', String(ownerType));
      if (ownerId) params.set('owner_id', String(ownerId));
      const qs = params.toString();
      return request(`/api/student-affairs/documents${qs ? `?${qs}` : ''}`);
    },
    createDocument: (payload) => request('/api/student-affairs/documents', { method: 'POST', body: JSON.stringify(payload) }),
    updateDocument: (id, payload, ownerType = 'student') => {
      const params = new URLSearchParams();
      if (ownerType) params.set('owner_type', ownerType);
      return request(`/api/student-affairs/documents/${id}?${params.toString()}`, { method: 'PUT', body: JSON.stringify(payload) });
    },
    deleteDocument: (id, ownerType = 'student') => {
      const params = new URLSearchParams();
      if (ownerType) params.set('owner_type', ownerType);
      return request(`/api/student-affairs/documents/${id}?${params.toString()}`, { method: 'DELETE' });
    }
  },
  resolveFileUrl: (value) => {
    if (!value) return '';
    if (String(value).startsWith('http://') || String(value).startsWith('https://')) return value;
    if (String(value).startsWith('/pdmada-api/')) return value;
    if (String(value).startsWith('/api/')) return `${API_BASE}${value}`;
    if (String(value).startsWith('/')) return `${API_BASE}${value}`;
    return `${API_BASE}/${value}`;
  }
};
