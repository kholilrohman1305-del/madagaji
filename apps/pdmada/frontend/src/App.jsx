import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { TABS } from './constants/tabs.js';
import { emptyForms } from './constants/emptyForms.js';
import { formatDate, formatYear } from './utils/formatters.js';
import { ToastStack } from './components/ToastStack.jsx';
import { DashboardHud } from './components/DashboardHud.jsx';
import { SidebarIcon } from './components/SidebarIcon.jsx';
import { KesiswaanSection } from './features/kesiswaan/KesiswaanSection.jsx';
import { StudentsSection } from './features/students/StudentsSection.jsx';
import { PondokPesantrenSection } from './features/pondok/PondokPesantrenSection.jsx';
import { TeachersSection } from './features/teachers/TeachersSection.jsx';
import { ClassesSection } from './features/classes/ClassesSection.jsx';
import { SubjectsSection } from './features/subjects/SubjectsSection.jsx';
import { ClassSubjectSettingsSection } from './features/class-subject-settings/ClassSubjectSettingsSection.jsx';
import { TeacherTasksSection } from './features/tasks/TeacherTasksSection.jsx';
import { BukuIndukSection } from './features/buku-induk/BukuIndukSection.jsx';
import { StudentScoresSection } from './features/scores/StudentScoresSection.jsx';
import { ReportCardsSection } from './features/report-cards/ReportCardsSection.jsx';
import { ArchivesSection } from './features/archives/ArchivesSection.jsx';
import { SchoolSettingsSection } from './features/settings/SchoolSettingsSection.jsx';
import { StudentAchievementsSection } from './features/achievements/StudentAchievementsSection.jsx';
import { StudentRecommendationsSection } from './features/recommendations/StudentRecommendationsSection.jsx';
import { ExtracurricularsSection } from './features/extracurriculars/ExtracurricularsSection.jsx';
import { StudentDocumentChecksSection } from './features/document-checks/StudentDocumentChecksSection.jsx';

export default function App({ session, onLogout }) {
  const systemDashboardUrl = import.meta.env.VITE_SYSTEM_DASHBOARD_URL || '/';
  const [active, setActive] = useState('dashboard');
  const [data, setData] = useState({ students: [], classes: [], schoolYears: [], semesters: [], teachers: [], subjects: [], extracurriculars: [], pondokPesantren: [], teacherTasks: [], additionalTasks: [], users: [] });
  const [form, setForm] = useState(emptyForms);
  const [editingId, setEditingId] = useState({ students: null, classes: null, schoolYears: null, teachers: null, subjects: null, pondokPesantren: null, teacherTasks: null, users: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTable, setAuditTable] = useState('');
  const [auditLimit, setAuditLimit] = useState(200);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClassId, setFilterClassId] = useState('all');
  const [filterSchoolYearId, setFilterSchoolYearId] = useState('all');
  const [filterSemesterId, setFilterSemesterId] = useState('all');
  const [studentCategoryFilter, setStudentCategoryFilter] = useState('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState({});
  const [selectedSemesterIds, setSelectedSemesterIds] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    const fallback = {
      utama: false,
      master: false,
      akademik: false,
      administrasi: false,
      pengaturan: false
    };
    try {
      const raw = localStorage.getItem('pdmada_sidebar_collapsed_groups');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return { ...fallback, ...(parsed || {}) };
    } catch {
      return fallback;
    }
  });
  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherPageSize, setTeacherPageSize] = useState(20);
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(20);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);
  const [studentSortBy, setStudentSortBy] = useState('name');
  const [studentSortDir, setStudentSortDir] = useState('asc');
  const [bulkTeacherClassification, setBulkTeacherClassification] = useState('');
  const [toasts, setToasts] = useState([]);
  const [studentFormTab, setStudentFormTab] = useState('identity');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importingMaster, setImportingMaster] = useState(false);
  const [fullDataLoaded, setFullDataLoaded] = useState(false);
  const [kesiswaan, setKesiswaan] = useState({ mutations: [], classHistories: [], documents: [] });
  const [kesiswaanStudentId, setKesiswaanStudentId] = useState('');
  const [mutationForm, setMutationForm] = useState({
    student_id: '', mutation_type: 'pindah', mutation_date: '', from_class_id: '', to_class_id: '', from_school: '', to_school: '', reason: '', notes: ''
  });
  const [classHistoryForm, setClassHistoryForm] = useState({
    student_id: '', class_id: '', school_year_id: '', semester_id: '', start_date: '', end_date: '', status: 'aktif', notes: ''
  });
  const [documentForm, setDocumentForm] = useState({
    student_id: '', document_type: '', file_number: '', file_url: '', issuer: '', issued_date: '', status: 'valid', notes: ''
  });
  const section = active;
  const studentSections = ['studentsActive', 'studentsMoved', 'studentsAlumni'];
  const importEntityBySection = {
    studentsActive: 'students',
    studentsMoved: 'students',
    studentsAlumni: 'students',
    teachers: 'teachers',
    subjects: 'subjects',
    classes: 'classes'
  };
  const isStudentSection = studentSections.includes(section);
  const dataSection = isStudentSection ? 'students' : section;
  const importEntity = importEntityBySection[section] || null;
  const canImportMaster = Boolean(importEntity);

  function pushToast(type, title, message, ttl = 3200) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, ttl);
  }

  const apiMap = useMemo(() => ({
    students: api.students,
    classes: api.classes,
    schoolYears: api.schoolYears,
    semesters: api.semesters,
    teachers: api.teachers,
    subjects: api.subjects,
    extracurriculars: api.extracurriculars,
    pondokPesantren: api.pondokPesantren,
    teacherTasks: api.teacherTasks,
    additionalTasks: api.additionalTasks,
    users: api.users
  }), []);

  async function loadUsersOnly() {
    try {
      const users = await api.users.list();
      setData((prev) => ({ ...prev, users }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDashboardBootstrap() {
    setLoading(true);
    setError('');
    try {
      const [students, classes, schoolYears, semesters, teachers, subjects] = await Promise.all([
        api.students.list(),
        api.classes.list(),
        api.schoolYears.list(),
        api.semesters.list(),
        api.teachers.list(),
        api.subjects.list()
      ]);
      setData((prev) => ({ ...prev, students, classes, schoolYears, semesters, teachers, subjects }));
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Sinkronisasi awal gagal', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [students, classes, schoolYears, semesters, teachers, subjects, extracurriculars, pondokPesantren, teacherTasks, additionalTasks] = await Promise.all([
        api.students.list(),
        api.classes.list(),
        api.schoolYears.list(),
        api.semesters.list(),
        api.teachers.list(),
        api.subjects.list(),
        api.extracurriculars.list(),
        api.pondokPesantren.list(),
        api.teacherTasks.list(),
        api.additionalTasks.list()
      ]);
      if (section === 'users') {
        const users = await api.users.list();
        setData({ students, classes, schoolYears, semesters, teachers, subjects, extracurriculars, pondokPesantren, teacherTasks, additionalTasks, users });
      } else {
        setData((prev) => ({ ...prev, students, classes, schoolYears, semesters, teachers, subjects, extracurriculars, pondokPesantren, teacherTasks, additionalTasks }));
      }
      setFullDataLoaded(true);
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Sinkronisasi gagal', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    setLoading(true);
    setError('');
    try {
      const rows = await api.audit.list({ table: auditTable || undefined, limit: auditLimit });
      setAuditLogs(rows);
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Gagal memuat log', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadKesiswaan(studentId = '') {
    setLoading(true);
    setError('');
    try {
      const sid = studentId || '';
      const [mutations, classHistories, documents] = await Promise.all([
        api.studentAffairs.listMutations(sid),
        api.studentAffairs.listClassHistories(sid),
        api.studentAffairs.listDocuments(sid)
      ]);
      setKesiswaan({ mutations, classHistories, documents });
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Gagal memuat kesiswaan', err.message);
    } finally {
      setLoading(false);
    }
  }

  function setField(section, field, value) {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  }

  function startEdit(section, item) {
    setViewOnly(false);
    setEditingId((prev) => ({ ...prev, [section]: item.id }));
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...item, is_active: !!item.is_active }
    }));
    if (section === 'students') setStudentFormTab('identity');
    setShowForm(true);
  }

  function openDetail(section, item) {
    setViewOnly(true);
    setEditingId((prev) => ({ ...prev, [section]: null }));
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...item, is_active: !!item.is_active }
    }));
    if (section === 'students') setStudentFormTab('identity');
    setShowForm(true);
  }

  function resetForm(section) {
    setViewOnly(false);
    setEditingId((prev) => ({ ...prev, [section]: null }));
    setForm((prev) => ({ ...prev, [section]: { ...emptyForms[section] } }));
    if (section === 'students') setStudentFormTab('identity');
  }

  async function submit(section) {
    setLoading(true);
    setError('');
    try {
      const payload = { ...form[section], is_active: form[section].is_active ? 1 : 0 };
      const id = editingId[section];
      if (id) {
        await apiMap[section].update(id, payload);
        pushToast('success', 'Perubahan tersimpan', `${activeLabel} berhasil diperbarui.`);
      } else {
        await apiMap[section].create(payload);
        pushToast('success', 'Data ditambahkan', `${activeLabel} berhasil ditambahkan.`);
      }
      resetForm(section);
      setShowForm(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Gagal menyimpan', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(section, id) {
    if (!confirm('Hapus data ini?')) return;
    setLoading(true);
    setError('');
    try {
      await apiMap[section].remove(id);
      pushToast('success', 'Data dihapus', `${activeLabel} berhasil dihapus.`);
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Gagal menghapus', err.message);
    } finally {
      setLoading(false);
    }
  }

  const classNameMap = useMemo(() => {
    const map = {};
    data.classes.forEach((cls) => {
      map[cls.id] = cls.name;
    });
    return map;
  }, [data.classes]);

  const schoolYearNameMap = useMemo(() => {
    const map = {};
    data.schoolYears.forEach((year) => {
      map[year.id] = year.name;
    });
    return map;
  }, [data.schoolYears]);

  const activeSchoolYear = useMemo(
    () => data.schoolYears.find((year) => Number(year.is_active) === 1),
    [data.schoolYears]
  );
  const activeSemester = useMemo(
    () => data.semesters.find((semester) => Number(semester.is_active) === 1),
    [data.semesters]
  );
  const activeStudentsCount = useMemo(
    () => data.students.filter((student) => String(student.student_status || '').toLowerCase() === 'aktif' || Number(student.is_active) === 1).length,
    [data.students]
  );
  const nonRombelStudentsCount = useMemo(
    () => data.students.filter((student) => (String(student.student_status || '').toLowerCase() === 'aktif' || Number(student.is_active) === 1) && !student.class_id).length,
    [data.students]
  );
  const alumniStudentsCount = useMemo(
    () => data.students.filter((student) => String(student.student_status || '').toLowerCase() === 'lulus').length,
    [data.students]
  );
  const activeTeachersCount = useMemo(
    () => data.teachers.filter((teacher) => Number(teacher.is_active) === 1).length,
    [data.teachers]
  );
  const activeClassesCount = useMemo(
    () => data.classes.filter((classItem) => Number(classItem.is_active) === 1).length,
    [data.classes]
  );
  const activeExtracurricularCount = useMemo(
    () => data.extracurriculars.filter((item) => Number(item.is_active) === 1).length,
    [data.extracurriculars]
  );
  const pondokGenderStats = useMemo(() => {
    const rows = {};
    data.students.forEach((student) => {
      const isActive = String(student.student_status || '').toLowerCase() === 'aktif' || Number(student.is_active) === 1;
      if (!isActive) return;
      const pondokName = String(student.pondok_pesantren || '').trim() || 'Tanpa Pondok';
      const genderValue = String(student.gender || '').toLowerCase();
      if (!rows[pondokName]) {
        rows[pondokName] = { pondok: pondokName, lakiLaki: 0, perempuan: 0, total: 0 };
      }
      if (genderValue === 'l' || genderValue === 'laki-laki' || genderValue === 'laki laki') {
        rows[pondokName].lakiLaki += 1;
      } else if (genderValue === 'p' || genderValue === 'perempuan') {
        rows[pondokName].perempuan += 1;
      }
      rows[pondokName].total += 1;
    });
    return Object.values(rows).sort((a, b) => b.total - a.total || a.pondok.localeCompare(b.pondok));
  }, [data.students]);
  const birthPlaceStats = useMemo(() => {
    let bojonegoro = 0;
    let luarBojonegoro = 0;
    data.students.forEach((student) => {
      const isActive = String(student.student_status || '').toLowerCase() === 'aktif' || Number(student.is_active) === 1;
      if (!isActive) return;
      const birthPlace = String(student.birth_place || '').toLowerCase();
      if (!birthPlace) return;
      if (birthPlace.includes('bojonegoro')) {
        bojonegoro += 1;
      } else {
        luarBojonegoro += 1;
      }
    });
    return { bojonegoro, luarBojonegoro };
  }, [data.students]);

  const activeLabel = TABS.find((t) => t.key === section)?.label || '';
  const topbarName = session?.username || 'Administrator';
  const topbarRole = session?.role === 'admin' ? 'Administrator' : (session?.role || 'User');
  const topbarInitial = String(topbarName || 'A').slice(0, 2).toUpperCase();
  const rootTabs = TABS.filter((tab) => !tab.parent);
  const studentSubTabs = TABS.filter((tab) => tab.parent === 'students');
  const tabByKey = useMemo(() => {
    const map = {};
    TABS.forEach((tab) => { map[tab.key] = tab; });
    return map;
  }, []);
  const menuGroups = useMemo(() => ([
    { id: 'utama', label: 'Menu Utama', keys: ['dashboard'] },
    { id: 'master', label: 'Data Master', keys: ['students', 'studentDocumentChecks', 'teachers', 'classes', 'subjects', 'extracurriculars', 'pondokPesantren'] },
    { id: 'akademik', label: 'Akademik', keys: ['schoolYears', 'classSubjectSettings', 'studentScores', 'reportCards', 'studentAchievements', 'studentRecommendations', 'kesiswaan'] },
    { id: 'administrasi', label: 'Administrasi', keys: ['teacherTasks', 'bukuInduk', 'archives'] },
    { id: 'pengaturan', label: 'Pengaturan Sistem', keys: ['users', 'schoolSettings'] }
  ]), []);
  const showContentTitle = false;
  const showHeadActions = !['dashboard', 'audit', 'kesiswaan', 'bukuInduk', 'studentScores', 'reportCards', 'archives', 'schoolSettings', 'classSubjectSettings', 'studentAchievements', 'studentRecommendations', 'extracurriculars', 'studentDocumentChecks'].includes(section);
  const filteredList = useMemo(() => {
    if (section === 'audit') return [];
    let list = data[dataSection] || [];

    if (filterStatus !== 'all') {
      const activeValue = filterStatus === 'active' ? 1 : 0;
      list = list.filter((item) => Number(item.is_active) === activeValue);
    }

    if (isStudentSection) {
      if (filterClassId !== 'all') {
        list = list.filter((item) => String(item.class_id || '') === String(filterClassId));
      }
      if (filterSchoolYearId !== 'all') {
        list = list.filter((item) => String(item.school_year_id || '') === String(filterSchoolYearId));
      }
      if (section === 'studentsActive') {
        list = list.filter((item) => String(item.student_status || '').toLowerCase() === 'aktif');
      }
      if (section === 'studentsMoved') {
        list = list.filter((item) => String(item.student_status || '').toLowerCase() === 'pindah');
      }
      if (section === 'studentsAlumni') {
        list = list.filter((item) => String(item.student_status || '').toLowerCase() === 'lulus');
      }
      const normalizeSortValue = (item) => {
        if (studentSortBy === 'name') return String(item.name || '').toLowerCase();
        if (studentSortBy === 'nisn') return String(item.nisn || '').toLowerCase();
        if (studentSortBy === 'class') return String(classNameMap[item.class_id] || '').toLowerCase();
        if (studentSortBy === 'status') return String(item.student_status || '').toLowerCase();
        if (studentSortBy === 'entry_date') return String(item.entry_date || '');
        return String(item.name || '').toLowerCase();
      };
      list = [...list].sort((a, b) => {
        const va = normalizeSortValue(a);
        const vb = normalizeSortValue(b);
        const cmp = va.localeCompare(vb, 'id', { numeric: true, sensitivity: 'base' });
        return studentSortDir === 'asc' ? cmp : -cmp;
      });
    }

    if (filterQuery.trim() !== '') {
      const q = filterQuery.trim().toLowerCase();
      list = list.filter((item) => {
        if (isStudentSection) {
          return (
            String(item.name || '').toLowerCase().includes(q) ||
            String(item.nisn || '').toLowerCase().includes(q) ||
            String(item.nis_local || '').toLowerCase().includes(q) ||
            String(item.nism || '').toLowerCase().includes(q)
          );
        }
        if (section === 'teachers') {
          return (
            String(item.name || '').toLowerCase().includes(q) ||
            String(item.niy || '').toLowerCase().includes(q) ||
            String(item.nik || '').toLowerCase().includes(q) ||
            String(item.subject || '').toLowerCase().includes(q)
          );
        }
        if (section === 'subjects') {
          return (
            String(item.name || '').toLowerCase().includes(q) ||
            String(item.code || '').toLowerCase().includes(q)
          );
        }
        if (section === 'classes') {
          return (
            String(item.name || '').toLowerCase().includes(q) ||
            String(item.grade_level || '').toLowerCase().includes(q)
          );
        }
        if (section === 'teacherTasks') {
          return (
            String(item.title || '').toLowerCase().includes(q) ||
            String(item.teacher_name || '').toLowerCase().includes(q)
          );
        }
        if (section === 'schoolYears') {
          return String(item.name || '').toLowerCase().includes(q);
        }
        if (section === 'pondokPesantren') {
          return String(item.name || '').toLowerCase().includes(q);
        }
        if (section === 'users') {
          return (
            String(item.username || '').toLowerCase().includes(q) ||
            String(item.role || '').toLowerCase().includes(q)
          );
        }
        return true;
      });
    }

    if (section === 'teachers') {
      list = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
    }
    if (section === 'classes') {
      list = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
    }
    if (section === 'subjects') {
      list = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
    }
    if (section === 'pondokPesantren') {
      list = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
    }

    return list;
  }, [data, dataSection, section, isStudentSection, filterStatus, filterClassId, filterSchoolYearId, filterQuery, studentSortBy, studentSortDir, classNameMap]);
  const filteredAudit = useMemo(() => {
    let list = auditLogs || [];
    if (filterQuery.trim() !== '') {
      const q = filterQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const dataString = typeof item.data_json === 'string'
          ? item.data_json
          : JSON.stringify(item.data_json || {});
        return (
          String(item.table_name || '').toLowerCase().includes(q) ||
          String(item.operation || '').toLowerCase().includes(q) ||
          String(item.record_id || '').toLowerCase().includes(q) ||
          dataString.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [auditLogs, filterQuery]);
  const teacherTotalPages = Math.max(1, Math.ceil(filteredList.length / teacherPageSize));
  const studentTotalPages = Math.max(1, Math.ceil(filteredList.length / studentPageSize));
  const genericPagedSections = ['classes', 'subjects', 'pondokPesantren', 'teacherTasks'];
  const isGenericPagedSection = genericPagedSections.includes(section);
  const listTotalPages = Math.max(1, Math.ceil(filteredList.length / listPageSize));
  const teacherPagedList = section === 'teachers'
    ? filteredList.slice((teacherPage - 1) * teacherPageSize, teacherPage * teacherPageSize)
    : filteredList;
  const studentPagedList = isStudentSection
    ? filteredList.slice((studentPage - 1) * studentPageSize, studentPage * studentPageSize)
    : filteredList;
  const genericPagedList = isGenericPagedSection
    ? filteredList.slice((listPage - 1) * listPageSize, listPage * listPageSize)
    : filteredList;
  const visibleList = section === 'teachers'
    ? teacherPagedList
    : isStudentSection
      ? studentPagedList
      : isGenericPagedSection
        ? genericPagedList
        : filteredList;
  const selectedForSection = selectedIds[section] || [];
  const isAllSelected = visibleList.length > 0 && selectedForSection.length === visibleList.length;

  useEffect(() => {
    loadDashboardBootstrap();
  }, []);

  useEffect(() => {
    setFilterStatus('all');
    setFilterClassId('all');
    setFilterSchoolYearId('all');
    setFilterSemesterId('all');
    setStudentCategoryFilter('all');
    setFilterQuery('');
    setTeacherPage(1);
    setListPage(1);
    setShowImportModal(false);
    setImportFile(null);
    if (section === 'audit') {
      setAuditTable('');
    }
    if (section === 'users') {
      loadUsersOnly();
    }
    if (section !== 'dashboard' && !fullDataLoaded) {
      loadAll();
    }
  }, [section, fullDataLoaded]);

  useEffect(() => {
    if (isStudentSection && filterSchoolYearId === 'all' && activeSchoolYear) {
      setFilterSchoolYearId(String(activeSchoolYear.id));
    }
  }, [section, isStudentSection, activeSchoolYear, filterSchoolYearId]);

  useEffect(() => {
    if (section === 'audit') {
      loadAudit();
    }
    if (section === 'kesiswaan') {
      loadKesiswaan(kesiswaanStudentId);
    }
  }, [section, auditTable, auditLimit]);

  useEffect(() => {
    if (section === 'kesiswaan') {
      loadKesiswaan(kesiswaanStudentId);
    }
  }, [kesiswaanStudentId]);

  useEffect(() => {
    try {
      localStorage.setItem('pdmada_sidebar_collapsed_groups', JSON.stringify(collapsedGroups));
    } catch {
      // ignore storage failure
    }
  }, [collapsedGroups]);

  useEffect(() => {
    if (section === 'teachers' && teacherPage > teacherTotalPages) {
      setTeacherPage(teacherTotalPages);
    }
    if (isStudentSection && studentPage > studentTotalPages) {
      setStudentPage(studentTotalPages);
    }
    if (isGenericPagedSection && listPage > listTotalPages) {
      setListPage(listTotalPages);
    }
  }, [section, isStudentSection, isGenericPagedSection, teacherPage, teacherTotalPages, studentPage, studentTotalPages, listPage, listTotalPages]);

  useEffect(() => {
    if (isStudentSection) setStudentPage(1);
  }, [section, isStudentSection, filterClassId, filterSchoolYearId, filterQuery, studentPageSize, studentSortBy, studentSortDir]);

  useEffect(() => {
    if (isGenericPagedSection) setListPage(1);
  }, [section, isGenericPagedSection, filterStatus, filterQuery, listPageSize]);

  function resetStudentFilters() {
    setFilterClassId('all');
    setFilterSchoolYearId(activeSchoolYear ? String(activeSchoolYear.id) : 'all');
    setStudentCategoryFilter('all');
    setFilterQuery('');
    setStudentSortBy('name');
    setStudentSortDir('asc');
    setStudentPage(1);
  }

  function handleMenuClick(key) {
    if (key === 'students') {
      setActive('studentsActive');
      return;
    }
    setActive(key);
  }

  function toggleMenuGroup(groupId) {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  function openCreateForm() {
    if (section === 'dashboard') return;
    setViewOnly(false);
    resetForm(dataSection);
    if (isStudentSection) setStudentFormTab('identity');
    setShowForm(true);
  }

  async function runTeacherBulkClassification() {
    const ids = selectedIds.teachers || [];
    if (!ids.length) return;
    if (!bulkTeacherClassification) return;
    setLoading(true);
    setError('');
    try {
      await api.teachers.bulkUpdate({ ids, classification: bulkTeacherClassification });
      setSelectedIds((prev) => ({ ...prev, teachers: [] }));
      pushToast('success', 'Berhasil', 'Klasifikasi guru massal berhasil diterapkan.');
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Gagal bulk update', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(entity, file) {
    if (!file) return;
    try {
      await api.importXlsx(entity, file);
      pushToast('success', 'Import selesai', `Data ${entity} berhasil diimpor.`);
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Import gagal', err.message);
    }
  }

  function openImportMasterModal() {
    if (!canImportMaster) return;
    setImportFile(null);
    setShowImportModal(true);
  }

  async function submitImportMaster() {
    if (!importEntity || !importFile) return;
    setImportingMaster(true);
    try {
      await handleImport(importEntity, importFile);
      setShowImportModal(false);
      setImportFile(null);
    } finally {
      setImportingMaster(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const current = new Set(prev[section] || []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [section]: Array.from(current) };
    });
  }

  function toggleSelectAll() {
    const allIds = visibleList.map((item) => item.id);
    setSelectedIds((prev) => {
      const current = new Set(prev[section] || []);
      if (current.size === allIds.length) {
        return { ...prev, [section]: [] };
      }
      return { ...prev, [section]: allIds };
    });
  }

  async function runBulk(action) {
    const ids = selectedIds[section] || [];
    if (!ids.length) return;
    try {
      await api.bulkAction(section, action, ids);
      setSelectedIds((prev) => ({ ...prev, [section]: [] }));
      pushToast('success', 'Bulk action selesai', `${action} berhasil dijalankan pada ${ids.length} data.`);
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Bulk action gagal', err.message);
    }
  }

  function toggleSemesterSelect(id) {
    setSelectedSemesterIds((prev) => {
      const current = new Set(prev);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return Array.from(current);
    });
  }

  async function runSemesterBulk(action) {
    if (!selectedSemesterIds.length) return;
    try {
      await api.bulkAction('semesters', action, selectedSemesterIds);
      setSelectedSemesterIds([]);
      pushToast('success', 'Bulk semester selesai', `${action} berhasil dijalankan pada ${selectedSemesterIds.length} semester.`);
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Bulk semester gagal', err.message);
    }
  }

  async function activateSchoolYear(id) {
    try {
      await api.schoolYears.activate(id);
      pushToast('success', 'Tahun ajaran aktif', 'Status tahun ajaran berhasil diperbarui.');
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Aktivasi gagal', err.message);
    }
  }

  async function activateSemester(id) {
    try {
      await api.semesters.activate(id);
      pushToast('success', 'Semester aktif', 'Status semester berhasil diperbarui.');
      await loadAll();
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Aktivasi gagal', err.message);
    }
  }

  async function submitMutation() {
    try {
      await api.studentAffairs.createMutation(mutationForm);
      pushToast('success', 'Mutasi tersimpan', 'Data mutasi siswa berhasil ditambahkan.');
      setMutationForm({ student_id: '', mutation_type: 'pindah', mutation_date: '', from_class_id: '', to_class_id: '', from_school: '', to_school: '', reason: '', notes: '' });
      await loadKesiswaan(kesiswaanStudentId);
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Mutasi gagal', err.message);
    }
  }

  async function submitClassHistory() {
    try {
      await api.studentAffairs.createClassHistory(classHistoryForm);
      pushToast('success', 'Riwayat kelas tersimpan', 'Riwayat kelas siswa berhasil ditambahkan.');
      setClassHistoryForm({ student_id: '', class_id: '', school_year_id: '', semester_id: '', start_date: '', end_date: '', status: 'aktif', notes: '' });
      await loadKesiswaan(kesiswaanStudentId);
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Riwayat kelas gagal', err.message);
    }
  }

  async function submitDocument() {
    try {
      await api.studentAffairs.createDocument(documentForm);
      pushToast('success', 'Dokumen tersimpan', 'Dokumen siswa berhasil ditambahkan.');
      setDocumentForm({ student_id: '', document_type: '', file_number: '', file_url: '', issuer: '', issued_date: '', status: 'valid', notes: '' });
      await loadKesiswaan(kesiswaanStudentId);
    } catch (err) {
      setError(err.message);
      pushToast('error', 'Dokumen gagal', err.message);
    }
  }

  return (
    <div className="app-shell">
      <ToastStack toasts={toasts} />
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">S</div>
          <div>
            <div className="brand-text">SchoolPro</div>
            <div className="brand-sub">Sistem Manajemen Madrasah</div>
          </div>
        </div>
        <nav className="menu">
          {menuGroups.map((group) => (
            <div className="menu-group" key={group.id}>
              <button className="menu-group-toggle" onClick={() => toggleMenuGroup(group.id)}>
                <span>{group.label.toUpperCase()}</span>
                <span className="menu-group-chevron" aria-hidden="true">
                  {collapsedGroups[group.id] ? '▾' : '▴'}
                </span>
              </button>
              {!collapsedGroups[group.id] && (
                <div className="menu-group-items">
                  {group.keys.map((key) => {
                    const tab = tabByKey[key];
                    if (!tab) return null;
                    const isStudentsRoot = key === 'students';
                    const isStudentsActive = isStudentsRoot && studentSubTabs.some((s) => s.key === active);
                    return (
                      <div key={tab.key}>
                        <button
                          className={active === tab.key || isStudentsActive ? 'menu-item active' : 'menu-item'}
                          onClick={() => handleMenuClick(tab.key)}
                        >
                          <SidebarIcon name={tab.icon} />
                          {tab.label}
                        </button>
                        {isStudentsRoot && (
                          <div className="menu-sub">
                            {studentSubTabs.map((sub) => (
                              <button
                                key={sub.key}
                                className={active === sub.key ? 'menu-item submenu active' : 'menu-item submenu'}
                                onClick={() => setActive(sub.key)}
                              >
                                <SidebarIcon name={sub.icon} size={14} />
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h2>{activeLabel}</h2>
          </div>
          <div className="topbar-actions">
            <a className="topbar-back-btn" href={systemDashboardUrl}>
              Kembali ke Dashboard
            </a>
            <div className="pill">TP: {activeSchoolYear?.name || '-'} · Smt: {activeSemester?.name || '-'}</div>
            <button className="topbar-icon-btn" title="Notifikasi">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <div className="topbar-user">
              <div className="topbar-avatar">{topbarInitial}</div>
              <div>
                <div className="topbar-user-name">{topbarName}</div>
                <div className="topbar-user-role">{topbarRole}</div>
              </div>
            </div>
            <button className="ghost" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <div className="content">
          {(showContentTitle || showHeadActions) && (
            <div className={`page-head ${showContentTitle ? '' : 'compact'}`}>
              {showContentTitle && (
              <div>
                <h1>{activeLabel}</h1>
                <p className="sub">Kelola data utama dan daftar {activeLabel.toLowerCase()}.</p>
              </div>
              )}
              {showHeadActions && (
                <div className={`head-actions ${isStudentSection ? 'head-actions-student' : ''}`}>
                  {canImportMaster && (
                    <button className="btn-import" onClick={openImportMasterModal}>
                      Import
                    </button>
                  )}
                  <button className="btn-gradient" onClick={openCreateForm}>
                    {isStudentSection ? 'Tambah Siswa' : 'Tambah'}
                  </button>
                  <button className="btn-export">Export</button>
                </div>
              )}
            </div>
          )}

          {showImportModal && canImportMaster && (
            <div className="student-modal-overlay" onClick={() => setShowImportModal(false)}>
              <section className="student-modal import-master-modal" onClick={(e) => e.stopPropagation()}>
                <div className="student-editor-head">
                  <div>
                    <h2>Import Data Master</h2>
                    <p>Unduh template resmi, lalu upload file Excel untuk diproses.</p>
                  </div>
                  <button className="ghost" onClick={() => setShowImportModal(false)}>Tutup</button>
                </div>
                <div className="import-master-body">
                  <a
                    className="btn-export"
                    href={api.downloadTemplate(importEntity)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Template
                  </a>
                  <label className="import-master-file">
                    <span>Pilih File Excel</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <div className="import-master-filename">
                    {importFile ? importFile.name : 'Belum ada file dipilih'}
                  </div>
                </div>
                <div className="actions student-form-actions">
                  <button className="ghost" onClick={() => setShowImportModal(false)}>Batal</button>
                  <button
                    className="btn-import"
                    disabled={!importFile || importingMaster}
                    onClick={submitImportMaster}
                  >
                    {importingMaster ? 'Mengimpor...' : 'Import Data Master'}
                  </button>
                </div>
              </section>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          {section === 'dashboard' && (
            <DashboardHud
              studentsCount={data.students.length}
              activeStudentsCount={activeStudentsCount}
              nonRombelStudentsCount={nonRombelStudentsCount}
              alumniStudentsCount={alumniStudentsCount}
              teachersCount={activeTeachersCount}
              subjectsCount={data.subjects.length}
              classesCount={activeClassesCount}
              extracurricularCount={activeExtracurricularCount}
              pondokGenderStats={pondokGenderStats}
              bojonegoroBirthCount={birthPlaceStats.bojonegoro}
              outsideBojonegoroBirthCount={birthPlaceStats.luarBojonegoro}
              activeSchoolYearName={activeSchoolYear?.name}
              activeSemesterName={activeSemester?.name}
            />
          )}

          {section === 'audit' && (
            <section className="panel form-closed">
              <div className="panel-right">
                <h2>Log Perubahan</h2>
                <div className="filters">
                  <select className="filter" value={auditTable} onChange={(e) => setAuditTable(e.target.value)}>
                    <option value="">Semua Tabel</option>
                    <option value="students">students</option>
                    <option value="teachers">teachers</option>
                    <option value="subjects">subjects</option>
                    <option value="classes">classes</option>
                    <option value="school_years">school_years</option>
                    <option value="semesters">semesters</option>
                  </select>
                  <select className="filter" value={auditLimit} onChange={(e) => setAuditLimit(Number(e.target.value))}>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                  <input
                    className="filter"
                    placeholder="Cari tabel / operasi / record id"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                  />
                </div>
                <div className="table">
                  <div className="table-head">
                    <span>Waktu</span>
                    <span>Tabel</span>
                    <span>Record</span>
                    <span>Operasi</span>
                    <span>Sumber</span>
                    <span>Data</span>
                  </div>
                  {filteredAudit.map((item) => (
                    <div className="table-row" key={item.id}>
                      <span>{item.changed_at}</span>
                      <span>{item.table_name}</span>
                      <span>{item.record_id}</span>
                      <span className={item.operation === 'delete' ? 'danger-text' : ''}>{item.operation}</span>
                      <span>{item.source}</span>
                      <span className="mono">{typeof item.data_json === 'string' ? item.data_json : JSON.stringify(item.data_json || {})}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {section === 'kesiswaan' && (
            <KesiswaanSection
              data={data}
              api={api}
              loadAll={loadAll}
            />
          )}

          {section === 'bukuInduk' && (
            <BukuIndukSection
              api={api}
              data={data}
              loading={loading}
              setError={setError}
            />
          )}

          {section === 'studentScores' && (
            <StudentScoresSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'reportCards' && (
            <ReportCardsSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'classSubjectSettings' && (
            <ClassSubjectSettingsSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'archives' && (
            <ArchivesSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'studentAchievements' && (
            <StudentAchievementsSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'studentRecommendations' && (
            <StudentRecommendationsSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'studentDocumentChecks' && (
            <StudentDocumentChecksSection
              api={api}
              data={data}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'extracurriculars' && (
            <ExtracurricularsSection
              api={api}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'schoolSettings' && (
            <SchoolSettingsSection
              api={api}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {isStudentSection && (
            <StudentsSection
              api={api}
              data={data}
              visibleList={visibleList}
              loading={loading}
              filterClassId={filterClassId}
              setFilterClassId={setFilterClassId}
              filterSchoolYearId={filterSchoolYearId}
              setFilterSchoolYearId={setFilterSchoolYearId}
              studentCategoryFilter={studentCategoryFilter}
              setStudentCategoryFilter={setStudentCategoryFilter}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              studentPage={studentPage}
              setStudentPage={setStudentPage}
              studentPageSize={studentPageSize}
              setStudentPageSize={setStudentPageSize}
              studentTotalPages={studentTotalPages}
              totalRows={filteredList.length}
              studentSortBy={studentSortBy}
              setStudentSortBy={setStudentSortBy}
              studentSortDir={studentSortDir}
              setStudentSortDir={setStudentSortDir}
              resetStudentFilters={resetStudentFilters}
              classNameMap={classNameMap}
              formatDate={formatDate}
              formatYear={formatYear}
              section="students"
              openDetail={openDetail}
              startEdit={startEdit}
              showForm={showForm}
              viewOnly={viewOnly}
              editingId={editingId}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              studentFormTab={studentFormTab}
              setStudentFormTab={setStudentFormTab}
              form={form}
              setField={setField}
              submit={submit}
              resetForm={resetForm}
            />
          )}

          {section === 'pondokPesantren' && (
            <PondokPesantrenSection
              data={data}
              visibleList={visibleList}
              loading={loading}
              listPage={listPage}
              setListPage={setListPage}
              listPageSize={listPageSize}
              setListPageSize={setListPageSize}
              listTotalPages={listTotalPages}
              totalRows={filteredList.length}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              showForm={showForm}
              viewOnly={viewOnly}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              form={form}
              setField={setField}
              submit={submit}
              editingId={editingId}
              startEdit={startEdit}
              removeItem={removeItem}
            />
          )}

          {section === 'teachers' && (
            <TeachersSection
              api={api}
              data={data}
              visibleList={visibleList}
              loading={loading}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              teacherPage={teacherPage}
              setTeacherPage={setTeacherPage}
              teacherPageSize={teacherPageSize}
              setTeacherPageSize={setTeacherPageSize}
              teacherTotalPages={teacherTotalPages}
              totalRows={filteredList.length}
              openDetail={openDetail}
              startEdit={startEdit}
              removeItem={removeItem}
              showForm={showForm}
              viewOnly={viewOnly}
              editingId={editingId}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              form={form}
              setField={setField}
              submit={submit}
              resetForm={resetForm}
            />
          )}

          {section === 'classes' && (
            <ClassesSection
              api={api}
              data={data}
              visibleList={visibleList}
              loading={loading}
              listPage={listPage}
              setListPage={setListPage}
              listPageSize={listPageSize}
              setListPageSize={setListPageSize}
              listTotalPages={listTotalPages}
              totalRows={filteredList.length}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              startEdit={startEdit}
              removeItem={removeItem}
              showForm={showForm}
              viewOnly={viewOnly}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              form={form}
              setField={setField}
              submit={submit}
              resetForm={resetForm}
              editingId={editingId}
              onRefresh={loadAll}
              setError={setError}
              pushToast={pushToast}
            />
          )}

          {section === 'subjects' && (
            <SubjectsSection
              visibleList={visibleList}
              loading={loading}
              listPage={listPage}
              setListPage={setListPage}
              listPageSize={listPageSize}
              setListPageSize={setListPageSize}
              listTotalPages={listTotalPages}
              totalRows={filteredList.length}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              startEdit={startEdit}
              removeItem={removeItem}
              showForm={showForm}
              viewOnly={viewOnly}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              form={form}
              setField={setField}
              submit={submit}
              resetForm={resetForm}
              editingId={editingId}
            />
          )}

          {section === 'teacherTasks' && (
            <TeacherTasksSection
              data={data}
              visibleList={visibleList}
              loading={loading}
              listPage={listPage}
              setListPage={setListPage}
              listPageSize={listPageSize}
              setListPageSize={setListPageSize}
              listTotalPages={listTotalPages}
              totalRows={filteredList.length}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              startEdit={startEdit}
              removeItem={removeItem}
              showForm={showForm}
              viewOnly={viewOnly}
              setShowForm={setShowForm}
              setViewOnly={setViewOnly}
              form={form}
              setField={setField}
              submit={submit}
              resetForm={resetForm}
              editingId={editingId}
            />
          )}

          {section !== 'dashboard' && section !== 'audit' && section !== 'kesiswaan' && section !== 'bukuInduk' && section !== 'studentScores' && section !== 'reportCards' && section !== 'archives' && section !== 'schoolSettings' && section !== 'classSubjectSettings' && section !== 'studentAchievements' && section !== 'studentRecommendations' && section !== 'extracurriculars' && section !== 'studentDocumentChecks' && !isStudentSection && section !== 'pondokPesantren' && section !== 'teachers' && section !== 'classes' && section !== 'subjects' && section !== 'teacherTasks' && (
            <section className={showForm ? 'panel form-open' : 'panel form-closed'}>
              <div className={showForm ? 'panel-left drawer' : 'panel-left hidden'}>
                <h2>Form {TABS.find((t) => t.key === section)?.label}</h2>

          {section === 'classes' && (
            <div className="form">
              <label>Nama Rombel<input value={form.classes.name} onChange={(e) => setField('classes', 'name', e.target.value)} /></label>
              <label>Tingkat<input value={form.classes.grade_level} onChange={(e) => setField('classes', 'grade_level', e.target.value)} /></label>
              <label>Wali Kelas<input value={form.classes.homeroom_teacher} onChange={(e) => setField('classes', 'homeroom_teacher', e.target.value)} /></label>
              <label>Nama Ruangan<input value={form.classes.room_name} onChange={(e) => setField('classes', 'room_name', e.target.value)} /></label>
              <label>Kurikulum<input value={form.classes.curriculum} onChange={(e) => setField('classes', 'curriculum', e.target.value)} /></label>
              <label>Jumlah Siswa<input type="number" value={form.classes.student_count} onChange={(e) => setField('classes', 'student_count', e.target.value)} /></label>
              <label>Kapasitas<input type="number" value={form.classes.max_students} onChange={(e) => setField('classes', 'max_students', e.target.value)} /></label>
              <label>JTM Rombel<input type="number" value={form.classes.jtm_rombel} onChange={(e) => setField('classes', 'jtm_rombel', e.target.value)} /></label>
              <label className="checkbox">
                <input type="checkbox" checked={form.classes.is_active} onChange={(e) => setField('classes', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}
          {section === 'schoolYears' && (
            <div className="form">
              <label>Nama Tahun Ajaran<input value={form.schoolYears.name} onChange={(e) => setField('schoolYears', 'name', e.target.value)} /></label>
              <label className="checkbox">
                <input type="checkbox" checked={form.schoolYears.is_active} onChange={(e) => setField('schoolYears', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}

          {section === 'teachers' && (
            <div className="form">
              <div className="form-group">
                <h3>Identitas</h3>
              <label>NIY<input value={form.teachers.niy} onChange={(e) => setField('teachers', 'niy', e.target.value)} /></label>
              <label>Nama<input value={form.teachers.name} onChange={(e) => setField('teachers', 'name', e.target.value)} /></label>
              <label>Klasifikasi
                <select value={form.teachers.classification} onChange={(e) => setField('teachers', 'classification', e.target.value)}>
                  <option value="">-</option>
                  <option value="PNS">PNS</option>
                  <option value="Inpassing">Inpassing</option>
                  <option value="Sertifikasi">Sertifikasi</option>
                  <option value="Non Sertifikasi">Non Sertifikasi</option>
                </select>
              </label>
              <label>Gelar<input value={form.teachers.degree} onChange={(e) => setField('teachers', 'degree', e.target.value)} /></label>
              <label>Mapel<input value={form.teachers.subject} onChange={(e) => setField('teachers', 'subject', e.target.value)} /></label>
              <label>Tugas Tambahan
                <select value={form.teachers.additional_task} onChange={(e) => setField('teachers', 'additional_task', e.target.value)}>
                  <option value="">-</option>
                  {data.additionalTasks.filter((t) => Number(t.is_active) === 1).map((task) => (
                    <option key={task.id} value={task.name}>{task.name}</option>
                  ))}
                </select>
              </label>
              <label>No. Telp<input value={form.teachers.phone} onChange={(e) => setField('teachers', 'phone', e.target.value)} /></label>
              <label>Email<input value={form.teachers.email} onChange={(e) => setField('teachers', 'email', e.target.value)} /></label>
              </div>
              <div className="form-group">
                <h3>Pendidikan</h3>
              <label>S1 (Universitas)<input value={form.teachers.s1_university} onChange={(e) => setField('teachers', 's1_university', e.target.value)} /></label>
              <label>Prodi S1<input value={form.teachers.s1_major} onChange={(e) => setField('teachers', 's1_major', e.target.value)} /></label>
              <label>Tahun Lulus S1<input type="number" value={form.teachers.s1_grad_year} onChange={(e) => setField('teachers', 's1_grad_year', e.target.value)} /></label>
              <label>S2 (Universitas)<input value={form.teachers.s2_university} onChange={(e) => setField('teachers', 's2_university', e.target.value)} /></label>
              <label>Prodi S2<input value={form.teachers.s2_major} onChange={(e) => setField('teachers', 's2_major', e.target.value)} /></label>
              <label>Tahun Lulus S2<input type="number" value={form.teachers.s2_grad_year} onChange={(e) => setField('teachers', 's2_grad_year', e.target.value)} /></label>
              </div>
              <div className="form-group">
                <h3>Sertifikasi</h3>
              <label>Sertifikat Pendidik<input value={form.teachers.educator_certificate} onChange={(e) => setField('teachers', 'educator_certificate', e.target.value)} /></label>
              <label>Prodi Sertifikat<input value={form.teachers.certificate_major} onChange={(e) => setField('teachers', 'certificate_major', e.target.value)} /></label>
              </div>
              <div className="form-group">
                <h3>Administrasi</h3>
              <label>NIK<input value={form.teachers.nik} onChange={(e) => setField('teachers', 'nik', e.target.value)} /></label>
              <label>No. KK<input value={form.teachers.family_card_number} onChange={(e) => setField('teachers', 'family_card_number', e.target.value)} /></label>
              <label>TMT<input type="date" value={form.teachers.tmt || ''} onChange={(e) => setField('teachers', 'tmt', e.target.value)} /></label>
              <label>Jenis Kelamin
                <select value={form.teachers.gender} onChange={(e) => setField('teachers', 'gender', e.target.value)}>
                  <option value="">-</option>
                  <option value="L">L</option>
                  <option value="P">P</option>
                </select>
              </label>
              <label>Tempat Lahir<input value={form.teachers.birth_place} onChange={(e) => setField('teachers', 'birth_place', e.target.value)} /></label>
              <label>Tanggal Lahir<input type="date" value={form.teachers.birth_date || ''} onChange={(e) => setField('teachers', 'birth_date', e.target.value)} /></label>
              </div>
              <div className="form-group">
                <h3>Alamat</h3>
              <label>Alamat<textarea value={form.teachers.address} onChange={(e) => setField('teachers', 'address', e.target.value)} /></label>
              <label>Desa/Kelurahan<input value={form.teachers.address_village} onChange={(e) => setField('teachers', 'address_village', e.target.value)} /></label>
              <label>Kecamatan<input value={form.teachers.address_subdistrict} onChange={(e) => setField('teachers', 'address_subdistrict', e.target.value)} /></label>
              <label>Kabupaten/Kota<input value={form.teachers.address_city} onChange={(e) => setField('teachers', 'address_city', e.target.value)} /></label>
              <label>Provinsi<input value={form.teachers.address_province} onChange={(e) => setField('teachers', 'address_province', e.target.value)} /></label>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={form.teachers.is_active} onChange={(e) => setField('teachers', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}

          {section === 'subjects' && (
            <div className="form">
              <label>Nama<input value={form.subjects.name} onChange={(e) => setField('subjects', 'name', e.target.value)} /></label>
              <label>Kelompok<input value={form.subjects.group_name} onChange={(e) => setField('subjects', 'group_name', e.target.value)} /></label>
              <label>Kode (Otomatis oleh sistem)<input value={form.subjects.code} onChange={(e) => setField('subjects', 'code', e.target.value)} /></label>
              <label className="checkbox">
                <input type="checkbox" checked={form.subjects.is_active} onChange={(e) => setField('subjects', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}

          {section === 'teacherTasks' && (
            <div className="form">
              <label>Guru
                <select value={form.teacherTasks.teacher_id} onChange={(e) => setField('teacherTasks', 'teacher_id', e.target.value)}>
                  <option value="">-</option>
                  {data.teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.niy})</option>
                  ))}
                </select>
              </label>
              <label>Judul Tugas
                <select value={form.teacherTasks.title} onChange={(e) => setField('teacherTasks', 'title', e.target.value)}>
                  <option value="">-</option>
                  {data.additionalTasks.filter((t) => Number(t.is_active) === 1).map((task) => (
                    <option key={task.id} value={task.name}>{task.name}</option>
                  ))}
                </select>
              </label>
              <label>Deskripsi<textarea value={form.teacherTasks.description} onChange={(e) => setField('teacherTasks', 'description', e.target.value)} /></label>
              <label>Tanggal Mulai<input type="date" value={form.teacherTasks.start_date || ''} onChange={(e) => setField('teacherTasks', 'start_date', e.target.value)} /></label>
              <label>Tanggal Selesai<input type="date" value={form.teacherTasks.end_date || ''} onChange={(e) => setField('teacherTasks', 'end_date', e.target.value)} /></label>
              <label>Status
                <select value={form.teacherTasks.status} onChange={(e) => setField('teacherTasks', 'status', e.target.value)}>
                  <option value="aktif">Aktif</option>
                  <option value="selesai">Selesai</option>
                  <option value="dibatalkan">Dibatalkan</option>
                </select>
              </label>
            </div>
          )}

          {section === 'pondokPesantren' && (
            <div className="form">
              <label>Nama Pondok Pesantren
                <input value={form.pondokPesantren.name} onChange={(e) => setField('pondokPesantren', 'name', e.target.value)} />
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={form.pondokPesantren.is_active} onChange={(e) => setField('pondokPesantren', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}

          {section === 'users' && (
            <div className="form">
              <label>Role
                <select value={form.users.role || 'admin'} onChange={(e) => {
                  const role = e.target.value;
                  setField('users', 'role', role);
                  if (role === 'guru') {
                    setField('users', 'ref_type', 'teacher');
                    setField('users', 'ref_id', '');
                  } else if (role === 'siswa') {
                    setField('users', 'ref_type', 'student');
                    setField('users', 'ref_id', '');
                  } else {
                    setField('users', 'ref_type', 'none');
                    setField('users', 'ref_id', '');
                  }
                }}>
                  <option value="admin">Admin</option>
                  <option value="wali_kelas">Wali Kelas</option>
                  <option value="guru">Guru</option>
                  <option value="siswa">Siswa</option>
                </select>
              </label>

              {form.users.role === 'guru' && (
                <label>Data Guru
                  <select value={form.users.ref_id || ''} onChange={(e) => setField('users', 'ref_id', e.target.value)}>
                    <option value="">Pilih guru</option>
                    {data.teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.niy || '-'})</option>
                    ))}
                  </select>
                </label>
              )}

              {form.users.role === 'siswa' && (
                <label>Data Siswa
                  <select value={form.users.ref_id || ''} onChange={(e) => setField('users', 'ref_id', e.target.value)}>
                    <option value="">Pilih siswa</option>
                    {data.students.map((student) => (
                      <option key={student.id} value={student.id}>{student.name} ({student.nis_local || student.nisn || '-'})</option>
                    ))}
                  </select>
                </label>
              )}

              {(form.users.role === 'guru' || form.users.role === 'siswa') && (
                <div className="pill">Username & password otomatis mengikuti {form.users.role === 'siswa' ? 'NIS' : 'NIY'}.</div>
              )}

              {(form.users.role === 'admin' || form.users.role === 'wali_kelas') && (
                <>
              <label>Username
                <input value={form.users.username || ''} onChange={(e) => setField('users', 'username', e.target.value)} />
              </label>
              <label>Password
                <input type="password" value={form.users.password || ''} onChange={(e) => setField('users', 'password', e.target.value)} placeholder={editingId.users ? 'Kosongkan jika tidak ubah' : ''} />
              </label>
                </>
              )}
              <label className="checkbox">
                <input type="checkbox" checked={!!form.users.is_active} onChange={(e) => setField('users', 'is_active', e.target.checked)} />
                Aktif
              </label>
            </div>
          )}

          <div className="actions">
            {!viewOnly && (
              <>
                <button className="primary" onClick={() => submit(section)}>{editingId[section] ? 'Update' : 'Simpan'}</button>
                <button className="ghost" onClick={() => resetForm(section)}>Reset</button>
              </>
            )}
            <button className="ghost" onClick={() => { setShowForm(false); setViewOnly(false); }}>Tutup</button>
          </div>
        </div>

        <div className="panel-right">
          <div className="filters">
            <select className="filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
            {section === 'students' && (
              <>
                <select className="filter" value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
                  <option value="all">Semua Tingkat/Kelas</option>
                  {data.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
                <select className="filter" value={filterSchoolYearId} onChange={(e) => setFilterSchoolYearId(e.target.value)}>
                  <option value="all">Semua Tahun Ajaran</option>
                  {data.schoolYears.map((year) => (
                    <option key={year.id} value={year.id}>{year.name}</option>
                  ))}
                </select>
                <select className="filter" value={filterSemesterId} onChange={(e) => setFilterSemesterId(e.target.value)}>
                  <option value="all">Semua Semester</option>
                  {data.semesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>{semester.name}</option>
                  ))}
                </select>
              </>
            )}
            <input
              className="filter"
              placeholder={
                section === 'students' ? 'Cari Nama / NISN' :
                section === 'teachers' ? 'Cari Nama / NIK / NIY' :
                section === 'subjects' ? 'Cari Mapel' :
                section === 'classes' ? 'Cari Kelas' :
                section === 'pondokPesantren' ? 'Cari nama pondok pesantren' :
                section === 'users' ? 'Cari username / role' :
                'Cari Tahun Ajaran'
              }
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
          {section !== 'schoolYears' && (
            <div className="table">
              <div className="table-head">
                {section === 'students' && (
                  <>
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>Nama (TMT)</span>
                    <span>NISN</span>
                    <span>Tempat Lahir</span>
                    <span>Tanggal Lahir</span>
                    <span>Kelas</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'classes' && (
                  <>
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>Nama Rombel</span>
                    <span>Tingkat</span>
                    <span>Wali Kelas</span>
                    <span>Nama Ruangan</span>
                    <span>Kurikulum</span>
                    <span>Jumlah Siswa</span>
                    <span>Kelebihan</span>
                    <span>JTM Rombel</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'teachers' && (
                  <>
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>Nama</span>
                    <span>TMT</span>
                    <span>Klasifikasi</span>
                    <span>Mapel</span>
                    <span>Tugas Tambahan</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'subjects' && (
                  <>
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>Nama</span>
                    <span>Kode</span>
                    <span>Kelompok</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'teacherTasks' && (
                  <>
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>Guru</span>
                    <span>Tugas</span>
                    <span>Mulai</span>
                    <span>Selesai</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'pondokPesantren' && (
                  <>
                    <span>Nama Pondok Pesantren</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
                {section === 'users' && (
                  <>
                    <span>Username</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </>
                )}
              </div>
              {visibleList.map((item) => (
                <div className="table-row" key={item.id}>
                  {section === 'students' && (
                    <>
                      <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                      <span>{item.name}</span>
                      <span>{item.nisn}</span>
                      <span>{item.birth_place || '-'}</span>
                      <span>{formatDate(item.birth_date)}</span>
                      <span>{item.class_id ? (classNameMap[item.class_id] || `ID ${item.class_id}`) : '-'}</span>
                      <span className={item.is_active ? 'badge success' : 'badge'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        <button onClick={() => openDetail(section, item)}>Detail</button>
                        <button onClick={() => startEdit(section, item)}>Edit</button>
                      </span>
                    </>
                  )}
                {section === 'classes' && (
                  <>
                    <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                    <span>{item.name}</span>
                    <span>{item.grade_level || '-'}</span>
                    <span>{item.homeroom_teacher || '-'}</span>
                    <span>{item.room_name || '-'}</span>
                    <span>{item.curriculum || '-'}</span>
                    <span>
                      {typeof item.student_count !== 'undefined' && typeof item.max_students !== 'undefined'
                        ? `${item.student_count || 0}/${item.max_students || 0}`
                        : '-'}
                    </span>
                    <span className={(item.max_students && item.student_count > item.max_students) ? 'danger-text' : ''}>
                      {(item.max_students && item.student_count > item.max_students) ? (item.student_count - item.max_students) : '-'}
                    </span>
                    <span>{item.jtm_rombel || '-'}</span>
                    <span className={item.is_active ? 'badge success' : 'badge'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                    <span>
                      <button onClick={() => startEdit(section, item)}>Aksi</button>
                    </span>
                  </>
                  )}
                  {section === 'teachers' && (
                    <>
                      <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                      <span>{item.name}</span>
                      <span>{formatYear(item.tmt)}</span>
                      <span>{item.classification || '-'}</span>
                      <span>{item.subject || '-'}</span>
                      <span>{item.additional_tasks || item.additional_task || '-'}</span>
                      <span>
                        <button onClick={() => startEdit(section, item)}>Aksi</button>
                      </span>
                    </>
                  )}
                  {section === 'subjects' && (
                    <>
                      <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                      <span>{item.name}</span>
                      <span className="code-pill">{item.code}</span>
                      <span>{item.group_name || '-'}</span>
                      <span className={item.is_active ? 'badge success' : 'badge'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        <button onClick={() => startEdit(section, item)}>Aksi</button>
                      </span>
                    </>
                  )}
                  {section === 'teacherTasks' && (
                    <>
                      <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                      <span>{item.teacher_name || '-'}</span>
                      <span>{item.title}</span>
                      <span>{formatDate(item.start_date)}</span>
                      <span>{formatDate(item.end_date)}</span>
                      <span className={item.status === 'dibatalkan' ? 'danger-text' : 'badge success'}>{item.status}</span>
                      <span>
                        <button onClick={() => startEdit(section, item)}>Aksi</button>
                      </span>
                    </>
                  )}
                  {section === 'pondokPesantren' && (
                    <>
                      <span>{item.name}</span>
                      <span className={Number(item.is_active) === 1 ? 'badge success' : 'badge'}>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        {item.id ? (
                          <>
                            <button onClick={() => startEdit(section, item)}>Edit</button>
                            <button className="danger" onClick={() => removeItem(section, item.id)}>Hapus</button>
                          </>
                        ) : (
                          <button onClick={() => setField('students', 'pondok_pesantren', item.name)}>Pakai di Siswa</button>
                        )}
                      </span>
                    </>
                  )}
                  {section === 'users' && (
                    <>
                      <span>{item.username}</span>
                      <span>{item.role}</span>
                      <span className={Number(item.is_active) === 1 ? 'badge success' : 'badge'}>{Number(item.is_active) === 1 ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        <button onClick={() => startEdit(section, item)}>Edit</button>
                        <button className="danger" onClick={() => removeItem(section, item.id)}>Hapus</button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {section === 'teachers' && (
            <div className="pagination">
              <button className="ghost" disabled={teacherPage <= 1} onClick={() => setTeacherPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Halaman {teacherPage} / {teacherTotalPages}</span>
              <button className="ghost" disabled={teacherPage >= teacherTotalPages} onClick={() => setTeacherPage((p) => Math.min(teacherTotalPages, p + 1))}>Next</button>
              <select className="filter" value={teacherPageSize} onChange={(e) => { setTeacherPageSize(Number(e.target.value)); setTeacherPage(1); }}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          )}

          {section === 'schoolYears' && (
            <div className="schoolyear-grid">
              <div className="table-card">
                <h3>Daftar Tahun Pelajaran</h3>
                <div className="table">
                  <div className="table-head">
                    <span><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></span>
                    <span>No.</span>
                    <span>Tahun Pelajaran</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </div>
                  {filteredList.map((item, index) => (
                    <div className="table-row" key={item.id}>
                      <span><input type="checkbox" checked={selectedForSection.includes(item.id)} onChange={() => toggleSelect(item.id)} /></span>
                      <span>{index + 1}</span>
                      <span>{item.name}</span>
                      <span className={item.is_active ? 'badge success' : 'badge'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        {!item.is_active && (
                          <button onClick={() => activateSchoolYear(item.id)}>Aktifkan</button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="table-card">
                <h3>Semester Berjalan</h3>
                <div className="table">
                  <div className="table-head">
                    <span><input type="checkbox" checked={data.semesters.length > 0 && selectedSemesterIds.length === data.semesters.length} onChange={() => {
                      if (selectedSemesterIds.length === data.semesters.length) setSelectedSemesterIds([]);
                      else setSelectedSemesterIds(data.semesters.map((s) => s.id));
                    }} /></span>
                    <span>No.</span>
                    <span>Semester</span>
                    <span>Status</span>
                    <span>Aksi</span>
                  </div>
                  {data.semesters.map((item, index) => (
                    <div className="table-row" key={item.id}>
                      <span><input type="checkbox" checked={selectedSemesterIds.includes(item.id)} onChange={() => toggleSemesterSelect(item.id)} /></span>
                      <span>{index + 1}</span>
                      <span>{item.name}</span>
                      <span className={item.is_active ? 'badge success' : 'badge'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <span>
                        {!item.is_active && (
                          <button onClick={() => activateSemester(item.id)}>Aktifkan</button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {showForm && !isStudentSection && section !== 'pondokPesantren' && section !== 'teachers' && section !== 'classes' && section !== 'subjects' && section !== 'teacherTasks' && section !== 'reportCards' && section !== 'archives' && section !== 'schoolSettings' && section !== 'classSubjectSettings' && section !== 'studentAchievements' && section !== 'studentRecommendations' && section !== 'extracurriculars' && section !== 'studentDocumentChecks' && (
          <div className="drawer-backdrop" onClick={() => setShowForm(false)} />
        )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
