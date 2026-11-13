import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Send,
  X,
  Minimize2,
  CheckCircle2,
  Clock,
  Building2,
  Phone,
  FileText,
  HelpCircle,
  Trash2,
  ArrowLeftRight,
  EyeOff,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { EmploymentOffice, SystemIssueReply, SystemIssueReport } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { groupAndSortOfficesByRegion } from '../utils/officeUtils';
import {
  reportSystemIssueOnline,
  subscribeSystemIssues,
  deleteSystemIssueOnline,
  clearAllSystemIssuesOnline,
} from '../services/firestoreService';

interface DOEAssistantMascotProps {
  offices?: EmploymentOffice[];
  currentOfficeName?: string;
  isFirestoreOnline?: boolean;
  onNavigateTab?: (tab: 'dashboard' | 'form' | 'history' | 'notes' | 'admin' | 'manual') => void;
}

const STORAGE_KEY_ISSUES = 'doe_assistant_reported_issues_v1';
const STORAGE_KEY_POSITION = 'doe_assistant_mascot_position_v1';
const STORAGE_KEY_SEEN_REPLIES = 'doe_assistant_seen_replies_v1';

function getNormalizedReplies(issue: SystemIssueReport): SystemIssueReply[] {
  if (Array.isArray(issue.replies) && issue.replies.length > 0) {
    return issue.replies;
  }
  if (issue.adminReply && issue.adminReply.trim()) {
    return [
      {
        id: `legacy-reply-${issue.id}`,
        sender: 'admin',
        senderName: 'ผู้ดูแลระบบส่วนกลาง',
        message: issue.adminReply.trim(),
        createdAt: issue.adminReplyAt || issue.updatedAt || issue.createdAt,
      },
    ];
  }
  return [];
}

function hasAdminReplied(issue: SystemIssueReport): boolean {
  return getNormalizedReplies(issue).some(
    (r) => r.sender === 'admin' && Boolean(r.message && r.message.trim().length > 0)
  );
}

function getLatestAdminReplyTimestamp(issue: SystemIssueReport): string {
  const replies = getNormalizedReplies(issue);
  for (let i = replies.length - 1; i >= 0; i--) {
    if (replies[i].sender === 'admin' && replies[i].message?.trim() && replies[i].createdAt) {
      return replies[i].createdAt;
    }
  }
  return issue.adminReply && issue.adminReply.trim() ? issue.adminReplyAt || '' : '';
}

export const DOEAssistantMascot: React.FC<DOEAssistantMascotProps> = ({
  offices = [],
  currentOfficeName = 'สำนักงานจัดหางาน',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<'new_ticket' | 'replies'>('new_ticket');
  const [isMascotActive, setIsMascotActive] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(false);
  const [dismissedUnreadBanner, setDismissedUnreadBanner] = useState(false);
  const mascotContainerRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  // Position state: 'left' or 'right'
  const [position, setPosition] = useState<'left' | 'right'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POSITION);
      if (saved === 'left' || saved === 'right') return saved;
    } catch {
      // ignore
    }
    return 'left';
  });

  const togglePosition = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMascotActive(true);
    setPosition((prev) => {
      const next = prev === 'left' ? 'right' : 'left';
      try {
        localStorage.setItem(STORAGE_KEY_POSITION, next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Issue Reporting Form State
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueOffice, setIssueOffice] = useState(currentOfficeName);
  const [issueReporterName, setIssueReporterName] = useState('');
  const [issueReporterPhone, setIssueReporterPhone] = useState('');
  const [contactError, setContactError] = useState('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueSubmittedSuccess, setIssueSubmittedSuccess] = useState<SystemIssueReport | null>(null);

  // Follow-up reply state from officer to admin (only enabled after admin has replied)
  const [reporterReplyDrafts, setReporterReplyDrafts] = useState<Record<string, string>>({});
  const [expandedReplyInputs, setExpandedReplyInputs] = useState<Record<string, boolean>>({});
  const [sendingFollowUpId, setSendingFollowUpId] = useState<string | null>(null);

  // Stored issues
  const [myIssues, setMyIssues] = useState<SystemIssueReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ISSUES);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Track which admin reply timestamps have been seen on this device
  const [seenRepliesMap, setSeenRepliesMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SEEN_REPLIES);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });

  // Office search & region filter
  const [officeSearchTerm, setOfficeSearchTerm] = useState('');
  const [selectedMascotRegion, setSelectedMascotRegion] = useState<string>('ทั้งหมด');

  // Group and sort offices by standard region
  const groupedOffices = useMemo(() => {
    const list = offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES;
    const filtered = list.filter((o) => {
      const matchRegion =
        selectedMascotRegion === 'ทั้งหมด' || o.region === selectedMascotRegion;
      const q = officeSearchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.centerName && o.centerName.toLowerCase().includes(q)) ||
        o.region.toLowerCase().includes(q);
      return matchRegion && matchSearch;
    });
    return groupAndSortOfficesByRegion(filtered);
  }, [offices, officeSearchTerm, selectedMascotRegion]);

  // Keep office in sync if currentOfficeName changes
  useEffect(() => {
    if (currentOfficeName) {
      setIssueOffice(currentOfficeName);
    }
  }, [currentOfficeName]);

  // Subscribe to issues from Firestore / Cloud SQL real-time stream
  useEffect(() => {
    const unsub = subscribeSystemIssues((onlineIssues) => {
      if (Array.isArray(onlineIssues)) {
        setMyIssues(onlineIssues);
        try {
          localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(onlineIssues));
        } catch {
          // ignore
        }
      }
    });
    return () => unsub();
  }, []);

  // Filter ONLY issues where Admin has actually typed a reply
  const issuesWithAdminReply = useMemo(() => {
    return myIssues.filter(hasAdminReplied);
  }, [myIssues]);

  const hasAnyAdminReply = issuesWithAdminReply.length > 0;

  // Reset active tab back to 'new_ticket' if there are no admin replies left
  useEffect(() => {
    if (!hasAnyAdminReply && activePanelTab === 'replies') {
      setActivePanelTab('new_ticket');
    }
  }, [hasAnyAdminReply, activePanelTab]);

  // Compute unread admin replies
  const unreadIssueIds = useMemo(() => {
    const ids = new Set<string>();
    issuesWithAdminReply.forEach((iss) => {
      const latestAdminTs = getLatestAdminReplyTimestamp(iss);
      if (latestAdminTs) {
        const seenTs = seenRepliesMap[iss.id] || '';
        if (!seenTs || latestAdminTs > seenTs) {
          ids.add(iss.id);
        }
      }
    });
    return ids;
  }, [issuesWithAdminReply, seenRepliesMap]);

  const unreadAdminRepliesCount = unreadIssueIds.size;

  // Re-surface notification banner whenever a brand-new unread admin reply arrives
  const latestGlobalAdminReplyKey = useMemo(() => {
    return issuesWithAdminReply
      .map((iss) => `${iss.id}:${getLatestAdminReplyTimestamp(iss)}`)
      .filter((s) => !s.endsWith(':'))
      .join('|');
  }, [issuesWithAdminReply]);

  useEffect(() => {
    if (unreadAdminRepliesCount > 0) {
      setDismissedUnreadBanner(false);
    }
  }, [latestGlobalAdminReplyKey, unreadAdminRepliesCount]);

  // Mark all current admin replies as seen when viewing the replies tab
  const markAllAdminRepliesSeen = () => {
    setSeenRepliesMap((prev) => {
      let changed = false;
      const next = { ...prev };
      issuesWithAdminReply.forEach((iss) => {
        const latestAdminTs = getLatestAdminReplyTimestamp(iss);
        if (latestAdminTs && next[iss.id] !== latestAdminTs) {
          next[iss.id] = latestAdminTs;
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem(STORAGE_KEY_SEEN_REPLIES, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      }
      return prev;
    });
  };

  useEffect(() => {
    if (isOpen && activePanelTab === 'replies' && unreadAdminRepliesCount > 0) {
      const timer = setTimeout(() => {
        markAllAdminRepliesSeen();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activePanelTab, unreadAdminRepliesCount, issuesWithAdminReply]);

  const handleDeleteSingleIssue = async (issueId: string) => {
    try {
      setMyIssues((prev) => {
        const next = prev.filter((i) => i.id !== issueId);
        try {
          localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(next));
        } catch {}
        return next;
      });
      await deleteSystemIssueOnline(issueId);
    } catch (err) {
      console.warn('Error deleting issue:', err);
    }
  };

  const handleClearAllIssues = async () => {
    try {
      setMyIssues([]);
      try {
        localStorage.setItem(STORAGE_KEY_ISSUES, '[]');
      } catch {}
      await clearAllSystemIssuesOnline();
    } catch (err) {
      console.warn('Error clearing issues:', err);
    }
  };

  // Return mascot to translucent state when clicking outside mascot and panel
  useEffect(() => {
    if (!isMascotActive && !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMascot = mascotContainerRef.current?.contains(target);
      const clickedInsidePanel = panelContainerRef.current?.contains(target);

      if (!clickedInsideMascot && !clickedInsidePanel) {
        setIsMascotActive(false);
        setIsOpen(false);
        setShowGreetingBubble(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMascotActive, isOpen]);

  const isContactComplete = useMemo(() => {
    const hasName = issueReporterName.trim().length > 0;
    const digitsOnly = issueReporterPhone.replace(/\D/g, '');
    const hasPhone = digitsOnly.length >= 9;
    return hasName && hasPhone;
  }, [issueReporterName, issueReporterPhone]);

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) return;

    const trimmedName = issueReporterName.trim();
    const trimmedPhone = issueReporterPhone.trim();
    const digitsOnly = trimmedPhone.replace(/\D/g, '');

    if (!trimmedName || !trimmedPhone) {
      setContactError('กรุณากรอกทั้งชื่อผู้แจ้งและเบอร์โทรศัพท์ให้ครบถ้วนก่อนบันทึกแจ้งข้อขัดข้อง');
      return;
    }
    if (digitsOnly.length < 9) {
      setContactError('กรุณากรอกหมายเลขโทรศัพท์ให้ครบถ้วน (อย่างน้อย 9 หลัก)');
      return;
    }

    setContactError('');
    setIsSubmittingIssue(true);

    const nowIso = new Date().toISOString();
    const newIssue: SystemIssueReport = {
      id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      issueType: 'other',
      title: issueTitle.trim(),
      description: issueDescription.trim(),
      officeName: issueOffice || currentOfficeName,
      reporterContact: `${trimmedName} โทร. ${trimmedPhone}`,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
      replies: [],
      clientInfo: `${navigator.userAgent.slice(0, 50)} | Online: ${navigator.onLine}`,
    };

    await reportSystemIssueOnline(newIssue);

    setMyIssues((prev) => [newIssue, ...prev]);
    setIsSubmittingIssue(false);
    setIssueSubmittedSuccess(newIssue);

    // Reset form fields
    setIssueTitle('');
    setIssueDescription('');
    setIssueReporterName('');
    setIssueReporterPhone('');
  };

  const handleSendReporterFollowUp = async (
    issue: SystemIssueReport,
    reopenIfResolved = false
  ) => {
    const rawMsg = (reporterReplyDrafts[issue.id] || '').trim();
    if (!rawMsg) return;

    setSendingFollowUpId(issue.id);
    try {
      const nowIso = new Date().toISOString();
      const existingReplies = getNormalizedReplies(issue);
      const senderLabel = issue.reporterContact
        ? issue.reporterContact.split(' โทร.')[0].trim()
        : issue.officeName || 'ผู้แจ้ง';

      const nextReply: SystemIssueReply = {
        id: `rep-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: 'reporter',
        senderName: senderLabel,
        message: rawMsg.slice(0, 1500),
        createdAt: nowIso,
      };

      const nextStatus =
        reopenIfResolved && issue.status === 'resolved' ? 'in_progress' : issue.status;

      const updated: SystemIssueReport = {
        ...issue,
        status: nextStatus,
        updatedAt: nowIso,
        replies: [...existingReplies, nextReply].slice(-50),
      };

      setMyIssues((prev) => {
        const next = prev.map((i) => (i.id === issue.id ? updated : i));
        try {
          localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(next));
        } catch {}
        return next;
      });
      setReporterReplyDrafts((prev) => ({ ...prev, [issue.id]: '' }));
      setExpandedReplyInputs((prev) => ({ ...prev, [issue.id]: false }));

      await reportSystemIssueOnline(updated);
    } finally {
      setSendingFollowUpId(null);
    }
  };

  const activeIssueCount = myIssues.filter((i) => i.status !== 'resolved').length;
  const hasUnreadAlert = unreadAdminRepliesCount > 0 && !dismissedUnreadBanner;
  const isClearVisible = isMascotActive || isOpen || hasUnreadAlert;

  // Shared renderer for an individual issue card (shows reply thread & reply button ONLY if Admin has replied)
  const renderIssueCard = (iss: SystemIssueReport) => {
    const adminHasReplied = hasAdminReplied(iss);
    const replies = adminHasReplied ? getNormalizedReplies(iss) : [];
    const isUnread = unreadIssueIds.has(iss.id);
    const isReplyBoxExpanded = Boolean(expandedReplyInputs[iss.id]);
    const draftMsg = reporterReplyDrafts[iss.id] || '';
    const isSendingFollowUp = sendingFollowUpId === iss.id;

    return (
      <div
        key={iss.id}
        className={`rounded-2xl p-3 border space-y-2.5 transition-all ${
          isUnread
            ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-400/20'
            : adminHasReplied
            ? 'bg-white border-indigo-200/90 shadow-2xs'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        {/* Ticket Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  iss.status === 'resolved'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : iss.status === 'in_progress'
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : 'bg-amber-100 text-amber-900 border-amber-200'
                }`}
              >
                {iss.status === 'resolved'
                  ? '✅ แก้ไขแล้ว'
                  : iss.status === 'in_progress'
                  ? '⏳ กำลังดำเนินการ'
                  : 'รอดำเนินการ'}
              </span>
              {isUnread && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black animate-pulse">
                  แอดมินตอบกลับใหม่!
                </span>
              )}
              <span className="text-[10px] text-slate-400 font-mono">
                {new Date(iss.createdAt).toLocaleString('th-TH', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <h4 className="font-extrabold text-xs text-slate-900 font-['Prompt'] leading-snug">
              {iss.title}
            </h4>
            <p className="text-[10.5px] font-semibold text-sky-800 truncate">
              🏛️ {iss.officeName || 'ไม่ระบุสำนักงาน'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleDeleteSingleIssue(iss.id)}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
            title="ลบรายการนี้"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Original Issue Detail */}
        <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">
          {iss.description}
        </p>

        {/* Admin Reply & Two-Way Follow-Up — Shown ONLY when Admin has replied! */}
        {adminHasReplied && (
          <>
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="text-[10.5px] font-extrabold text-emerald-900 flex items-center gap-1 font-['Prompt']">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>ข้อความตอบกลับจากผู้ดูแลระบบ</span>
              </div>

              <div className="space-y-2">
                {replies.map((rep) => {
                  const isAdminMsg = rep.sender === 'admin';
                  return (
                    <div
                      key={rep.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        isAdminMsg
                          ? 'bg-emerald-50/90 border-emerald-200 text-slate-900'
                          : 'bg-sky-50/70 border-sky-200 text-slate-800 ml-3'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`text-[10.5px] font-extrabold flex items-center gap-1 ${
                            isAdminMsg ? 'text-emerald-900' : 'text-sky-900'
                          }`}
                        >
                          {isAdminMsg ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{rep.senderName || 'ผู้ดูแลระบบส่วนกลาง'}</span>
                            </>
                          ) : (
                            <span>🙋‍♂️ {rep.senderName || 'ผู้แจ้ง'}</span>
                          )}
                        </span>
                        <span className="text-[9.5px] text-slate-400 shrink-0">
                          {new Date(rep.createdAt).toLocaleString('th-TH', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{rep.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Officer Follow-Up Reply Action (Available once Admin has initiated reply) */}
            {!isReplyBoxExpanded ? (
              <div className="pt-0.5 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedReplyInputs((prev) => ({
                      ...prev,
                      [iss.id]: true,
                    }))
                  }
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>ตอบกลับแอดมิน / แจ้งผลเพิ่มเติม</span>
                </button>
              </div>
            ) : (
              <div className="pt-1.5 space-y-2 border-t border-slate-100">
                <div className="flex flex-wrap gap-1">
                  {[
                    'ดำเนินการตามคำแนะนำแล้ว ใช้งานได้ปกติครับ ขอบคุณครับ',
                    'ยังพบอาการเดิมอยู่ รบกวนตรวจสอบเพิ่มเติมครับ',
                  ].map((quickText) => (
                    <button
                      key={quickText}
                      type="button"
                      onClick={() =>
                        setReporterReplyDrafts((prev) => ({
                          ...prev,
                          [iss.id]: quickText,
                        }))
                      }
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 transition-colors cursor-pointer"
                    >
                      + {quickText}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={draftMsg}
                  onChange={(e) =>
                    setReporterReplyDrafts((prev) => ({
                      ...prev,
                      [iss.id]: e.target.value,
                    }))
                  }
                  placeholder="พิมพ์ข้อความตอบกลับ หรือแจ้งผลการทดสอบให้แอดมินทราบ..."
                  className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                />

                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedReplyInputs((prev) => ({
                        ...prev,
                        [iss.id]: false,
                      }))
                    }
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  {iss.status === 'resolved' && (
                    <button
                      type="button"
                      disabled={isSendingFollowUp || !draftMsg.trim()}
                      onClick={() => handleSendReporterFollowUp(iss, true)}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 transition-colors cursor-pointer"
                    >
                      ส่งข้อความ & แจ้งตรวจสอบซ้ำ
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSendingFollowUp || !draftMsg.trim()}
                    onClick={() => handleSendReporterFollowUp(iss, false)}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>ส่งข้อความถึงแอดมิน</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ================= MASCOT FLOATING AVATAR ================= */}
      <div
        ref={mascotContainerRef}
        className={`fixed bottom-5 z-40 flex flex-col select-none transition-all duration-300 no-print ${
          position === 'left' ? 'left-4 sm:left-5 items-start' : 'right-4 sm:right-5 items-end'
        } ${isClearVisible ? 'opacity-100 scale-100' : 'opacity-25 scale-95'}`}
      >
        {/* Unread Admin Reply Floating Bubble — Shown ONLY when Admin has replied! */}
        {!isOpen && hasUnreadAlert && (
          <div className="mb-2.5 max-w-[300px] bg-white text-slate-800 p-3.5 rounded-2xl shadow-2xl border-2 border-emerald-400 ring-4 ring-emerald-400/25 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDismissedUnreadBanner(true);
                setIsMascotActive(false);
              }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-full flex items-center justify-center text-[10px] cursor-pointer shadow-xs border border-emerald-300"
              title="ซ่อนการแจ้งเตือนชั่วคราว"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0 p-1.5 bg-emerald-100 rounded-xl border border-emerald-200">
                💬
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-emerald-950 leading-tight flex items-center gap-1.5 font-['Prompt']">
                  <span>แอดมินตอบกลับแล้ว!</span>
                  <span className="text-[9.5px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-md font-bold">
                    {unreadAdminRepliesCount} รายการ
                  </span>
                </p>
                <p className="text-[11px] text-slate-700 leading-snug mt-1 font-medium">
                  ผู้ดูแลระบบส่งข้อความแจ้งวิธีแก้ไข / อัปเดตความคืบหน้าเข้ามาใหม่ คลิกเปิดอ่านได้เลยครับ
                </p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePanelTab('replies');
                      setIsOpen(true);
                      setShowGreetingBubble(false);
                      markAllAdminRepliesSeen();
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer text-center"
                  >
                    เปิดอ่านข้อความตอบกลับ
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`absolute -bottom-2 w-3.5 h-3.5 bg-white border-r-2 border-b-2 border-emerald-400 rotate-45 ${
                position === 'left' ? 'left-7' : 'right-7'
              }`}
            />
          </div>
        )}

        {/* Standard Floating Greeting Bubble */}
        {!isOpen && !hasUnreadAlert && isMascotActive && showGreetingBubble && (
          <div className="mb-2.5 max-w-[285px] bg-white text-slate-800 p-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 ring-4 ring-amber-400/25 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowGreetingBubble(false);
                setIsMascotActive(false);
              }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-full flex items-center justify-center text-[10px] cursor-pointer shadow-xs border border-amber-300"
              title="ปรับเป็นโหมดโปร่งใส"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="flex items-start gap-2.5">
              <span className="text-2xl shrink-0 p-1 bg-amber-100 rounded-xl border border-amber-200">🤖</span>
              <div>
                <p className="text-xs font-black text-amber-950 leading-tight flex items-center gap-1.5 font-['Prompt']">
                  <span>สวัสดีครับ! ผม NAIJEABKUB</span>
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-md font-bold">Online</span>
                </p>
                <p className="text-[11px] text-slate-700 leading-snug mt-1 font-medium">
                  หุ่นยนต์รับแจ้งปัญหาและข้อขัดข้องการใช้งานระบบ คลิกเพื่อเปิดหน้าต่างแจ้งเรื่องได้เลยครับ!
                </p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePanelTab('new_ticket');
                      setIsOpen(true);
                      setShowGreetingBubble(false);
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[11px] shadow-xs transition-colors cursor-pointer text-center"
                  >
                    แจ้งข้อขัดข้องระบบ
                  </button>
                  {hasAnyAdminReply && (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePanelTab('replies');
                        setIsOpen(true);
                        setShowGreetingBubble(false);
                        markAllAdminRepliesSeen();
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer text-center"
                    >
                      ข้อความตอบกลับ ({issuesWithAdminReply.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMascotActive(false);
                      setShowGreetingBubble(false);
                    }}
                    className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                    title="ปรับหุ่นยนต์ให้โปร่งใส"
                  >
                    <EyeOff className="w-3 h-3" />
                    {!hasAnyAdminReply && <span>โปร่งใส</span>}
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`absolute -bottom-2 w-3.5 h-3.5 bg-white border-r-2 border-b-2 border-amber-300 rotate-45 ${
                position === 'left' ? 'left-7' : 'right-7'
              }`}
            />
          </div>
        )}

        {/* Mascot Avatar Button */}
        <button
          type="button"
          onClick={() => {
            if (unreadAdminRepliesCount > 0 && !isOpen) {
              setActivePanelTab('replies');
              setIsOpen(true);
              setIsMascotActive(true);
              setShowGreetingBubble(false);
              markAllAdminRepliesSeen();
              return;
            }
            if (!isMascotActive && !isOpen) {
              setIsMascotActive(true);
              setShowGreetingBubble(true);
            } else if (!isOpen) {
              setIsOpen(true);
              setShowGreetingBubble(false);
            } else {
              setIsOpen(false);
              setIsMascotActive(false);
              setShowGreetingBubble(false);
            }
          }}
          title={
            unreadAdminRepliesCount > 0
              ? `มีข้อความตอบกลับจากแอดมิน ${unreadAdminRepliesCount} รายการ คลิกเพื่ออ่าน`
              : !isClearVisible
              ? 'คลิกเพื่อแสดงหุ่นยนต์ NAIJEABKUB แบบชัดเจน'
              : 'คลิกเพื่อเปิดหน้าต่างแจ้งข้อขัดข้องระบบ'
          }
          aria-label="เปิดหน้าต่างหุ่นยนต์ NAIJEABKUB แจ้งข้อขัดข้อง"
          className="group relative flex items-center gap-2.5 p-2 pr-4 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 rounded-full shadow-2xl shadow-amber-500/40 hover:shadow-amber-400/60 border-2 border-white ring-4 ring-amber-400/70 transition-all transform active:scale-95 cursor-pointer"
        >
          {/* Animated Robot Mascot Avatar Badge */}
          <div className="relative w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-md overflow-hidden border-2 border-amber-400 shrink-0">
            <svg
              viewBox="0 0 64 64"
              className="w-11 h-11 transition-transform group-hover:scale-110"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="32" cy="32" r="30" fill="#FEF3C7" />
              <path d="M16 58C16 48 22 46 32 46C42 46 48 48 48 58" fill="#2563EB" />
              <path
                d="M23 48L32 54L41 48"
                stroke="#F59E0B"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="32" cy="52" r="2.5" fill="#38BDF8" />
              <circle cx="32" cy="52" r="1.2" fill="#FFFFFF" />
              <rect x="28" y="42" width="8" height="5" rx="1.5" fill="#94A3B8" />
              <rect x="12" y="27" width="5" height="10" rx="2" fill="#0284C7" />
              <rect x="47" y="27" width="5" height="10" rx="2" fill="#0284C7" />
              <circle cx="14.5" cy="32" r="1.5" fill="#F59E0B" />
              <circle cx="49.5" cy="32" r="1.5" fill="#F59E0B" />
              <line x1="32" y1="18" x2="32" y2="10" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="32" cy="9" r="4" fill="#F59E0B" />
              <circle cx="32" cy="9" r="2" fill="#FEF08A" />
              <path d="M27 5C30 3 34 3 37 5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="16" y="18" width="32" height="25" rx="8" fill="#FFFFFF" stroke="#0284C7" strokeWidth="2" />
              <rect x="19" y="22" width="26" height="17" rx="5" fill="#0F172A" />
              <circle cx="26" cy="29" r="3.2" fill="#38BDF8" />
              <circle cx="38" cy="29" r="3.2" fill="#38BDF8" />
              <circle cx="25" cy="28" r="1.2" fill="#FFFFFF" />
              <circle cx="37" cy="28" r="1.2" fill="#FFFFFF" />
              <path
                d="M27 34C29 36.5 35 36.5 37 34"
                stroke="#34D399"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="21.5" cy="32" r="1.2" fill="#F472B6" />
              <circle cx="42.5" cy="32" r="1.2" fill="#F472B6" />
            </svg>
            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
          </div>

          {/* Label & Indicator */}
          <div className="text-left pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-black tracking-wide text-slate-950 drop-shadow-2xs font-['Prompt']">
                NAIJEABKUB
              </span>
              {unreadAdminRepliesCount > 0 ? (
                <span className="text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-full shadow-xs">
                  มีข้อความใหม่
                </span>
              ) : (
                <span className="text-[10px] bg-slate-900 text-amber-300 font-black px-2 py-0.5 rounded-full shadow-xs">
                  แจ้งปัญหา
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-900 font-bold leading-none mt-1 flex items-center gap-1">
              {unreadAdminRepliesCount > 0 ? (
                <>
                  <span>แอดมินตอบกลับ ({unreadAdminRepliesCount})</span>
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-700 animate-bounce" />
                </>
              ) : (
                <>
                  <span>{!isClearVisible ? 'คลิกเพื่อแสดงผลชัดเจน' : 'แจ้งข้อขัดข้องระบบ'}</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                </>
              )}
            </p>
          </div>

          {/* Unread reply badge or active ticket badge */}
          {unreadAdminRepliesCount > 0 ? (
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white animate-bounce">
              {unreadAdminRepliesCount}
            </span>
          ) : (
            activeIssueCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white">
                {activeIssueCount}
              </span>
            )
          )}
        </button>

        {/* Quick Position Switcher Pill */}
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={togglePosition}
            title={position === 'left' ? 'ย้ายหุ่นยนต์ไปไว้ฝั่งขวาของหน้าจอ' : 'ย้ายหุ่นยนต์ไปไว้ฝั่งซ้ายของหน้าจอ'}
            className="px-2.5 py-0.5 rounded-full bg-slate-900/90 hover:bg-slate-950 text-amber-300 border border-amber-400/60 shadow-md text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs hover:scale-105 active:scale-95"
          >
            <ArrowLeftRight className="w-3 h-3 text-amber-300" />
            <span>{position === 'left' ? 'ย้ายไปขวา ➔' : '⬅ ย้ายไปซ้าย'}</span>
          </button>
          {isClearVisible && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMascotActive(false);
                setIsOpen(false);
                setShowGreetingBubble(false);
                setDismissedUnreadBanner(true);
              }}
              title="ปรับหุ่นยนต์ให้เป็นลักษณะโปร่งใส"
              className="px-2 py-0.5 rounded-full bg-slate-800/90 hover:bg-slate-900 text-slate-200 border border-slate-600 shadow-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <EyeOff className="w-3 h-3" />
              <span>โปร่งใส</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= ISSUE REPORTING WINDOW PANEL ================= */}
      {isOpen && (
        <div
          ref={panelContainerRef}
          className={`fixed bottom-20 z-50 w-[95vw] sm:w-[430px] max-w-[450px] h-[590px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200 ring-1 ring-slate-950/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-sans transition-all ${
            position === 'left' ? 'left-2.5 sm:left-5' : 'right-2.5 sm:right-5'
          }`}
        >
          {/* 1. Panel Header */}
          <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-slate-950 p-3 px-3.5 sm:p-3.5 sm:px-4 flex items-center justify-between border-b border-amber-300 shrink-0 shadow-xs">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-amber-500 shrink-0">
                <span className="text-lg sm:text-xl">🤖</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <h3 className="font-black text-xs sm:text-base text-slate-950 tracking-tight font-['Prompt'] truncate">
                    NAIJEABKUB (แจ้งข้อขัดข้อง)
                  </h3>
                  <span className="text-[9px] sm:text-[10px] bg-slate-950 text-amber-300 font-black px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Helpdesk
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-800 font-semibold leading-none mt-0.5 truncate">
                  หุ่นยนต์ผู้ช่วยรับแจ้งปัญหาและข้อขัดข้องระบบ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button
                type="button"
                onClick={togglePosition}
                className="px-2 py-1.5 rounded-xl bg-slate-900/15 hover:bg-slate-900/25 text-slate-950 flex items-center gap-1 transition-colors cursor-pointer text-[11px] font-bold shadow-2xs"
                title={position === 'left' ? 'ย้ายหน้าต่างไปฝั่งขวา' : 'ย้ายหน้าต่างไปฝั่งซ้าย'}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-950" />
                <span>{position === 'left' ? 'ย้ายไปขวา' : 'ย้ายไปซ้าย'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsMascotActive(true);
                  setShowGreetingBubble(true);
                }}
                className="w-8 h-8 rounded-xl bg-slate-900/10 hover:bg-slate-900/20 text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                title="ย่อหน้าต่าง"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsMascotActive(false);
                  setShowGreetingBubble(false);
                }}
                className="w-8 h-8 rounded-xl bg-slate-900/10 hover:bg-rose-600 hover:text-white text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                title="ปิดหน้าต่างและกลับสู่โหมดโปร่งใส"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 1.5 Panel Mode Tabs — Shown ONLY when Admin has replied to at least one issue! */}
          {hasAnyAdminReply && (
            <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 shrink-0 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setActivePanelTab('new_ticket')}
                className={`py-2 px-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 font-['Prompt'] ${
                  activePanelTab === 'new_ticket'
                    ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activePanelTab === 'new_ticket' ? 'text-rose-600' : 'text-slate-400'
                  }`}
                />
                <span>แจ้งข้อขัดข้องใหม่</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivePanelTab('replies');
                  markAllAdminRepliesSeen();
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 font-['Prompt'] ${
                  activePanelTab === 'replies'
                    ? 'bg-white text-emerald-950 shadow-xs ring-1 ring-emerald-300'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <MessageCircle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    unreadAdminRepliesCount > 0
                      ? 'text-emerald-600'
                      : activePanelTab === 'replies'
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">ข้อความตอบกลับ ({issuesWithAdminReply.length})</span>
                {unreadAdminRepliesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-black animate-pulse">
                    ใหม่ {unreadAdminRepliesCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* 2. Main Scrollable Content */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 overflow-y-auto p-4 space-y-4">
            {hasAnyAdminReply && activePanelTab === 'replies' ? (
              /* ================= REPLIES VIEW (Only issues where Admin has typed a reply) ================= */
              <div className="space-y-3">
                <div className="bg-emerald-50/80 rounded-2xl p-3.5 border border-emerald-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-emerald-950 font-['Prompt'] truncate">
                        ข้อความตอบกลับจากผู้ดูแลระบบ ({issuesWithAdminReply.length} รายการ)
                      </p>
                      <p className="text-[10.5px] text-emerald-800 truncate">
                        รายละเอียดวิธีแก้ไขและการอัปเดตความคืบหน้าจากแอดมิน
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {issuesWithAdminReply.map((iss) => renderIssueCard(iss))}
                </div>
              </div>
            ) : (
              /* ================= DEFAULT ISSUE SUBMISSION FORM & HISTORY ================= */
              <>
                {/* Unread Admin Reply Banner inside Form View — Shown ONLY when unread Admin reply exists */}
                {unreadAdminRepliesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePanelTab('replies');
                      markAllAdminRepliesSeen();
                    }}
                    className="w-full text-left bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 rounded-2xl p-3 shadow-2xs transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-emerald-950 truncate">
                          แอดมินส่งข้อความตอบกลับมาแล้ว ({unreadAdminRepliesCount} รายการ)
                        </p>
                        <p className="text-[11px] text-emerald-800 truncate">
                          คลิกที่นี่เพื่อเปิดอ่านข้อความตอบกลับและวิธีแก้ไข
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                      เปิดอ่าน
                    </span>
                  </button>
                )}

                {/* Success Notification Alert */}
                {issueSubmittedSuccess && (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 shadow-xs text-xs text-emerald-900 flex items-start justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-sm text-emerald-950">
                          ส่งเรื่องแจ้งข้อขัดข้องเรียบร้อย!
                        </p>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          รหัส Ticket:{' '}
                          <span className="font-mono font-bold">{issueSubmittedSuccess.id}</span>
                        </p>
                        <p className="text-[11px] text-emerald-700 mt-1">
                          ระบบได้บันทึกข้อมูลและส่งเรื่องให้ทีมผู้ดูแลแล้วครับ
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIssueSubmittedSuccess(null)}
                      className="text-emerald-700 hover:text-emerald-950 text-xs font-bold p-1 cursor-pointer"
                      title="ปิดการแจ้งเตือน"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Issue Submission Form */}
                <form
                  onSubmit={handleSubmitIssue}
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5"
                >
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-900 font-bold text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>แบบฟอร์มส่งเรื่องแจ้งข้อขัดข้อง</span>
                  </div>

                  {/* 1. สำนักงานที่พบปัญหา */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>สำนักงานจัดหางาน / ศูนย์บริการที่พบปัญหา (เรียงตามภูมิภาค)</span>
                      </span>
                      <span className="text-[11px] text-sky-700 font-normal">
                        {groupedOffices.reduce((acc, g) => acc + g.offices.length, 0)} แห่ง
                      </span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={officeSearchTerm}
                        onChange={(e) => setOfficeSearchTerm(e.target.value)}
                        placeholder="ค้นหาสำนักงานหรือศูนย์..."
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                      />
                      <select
                        value={selectedMascotRegion}
                        onChange={(e) => setSelectedMascotRegion(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium text-slate-700"
                      >
                        <option value="ทั้งหมด">🌐 ทุกภูมิภาค</option>
                        <option value="กรุงเทพมหานคร">🏛️ กรุงเทพมหานคร</option>
                        <option value="ภาคกลางและตะวันตก">🌾 ภาคกลางและตะวันตก</option>
                        <option value="ภาคตะวันออก">🌊 ภาคตะวันออก</option>
                        <option value="ภาคตะวันออกเฉียงเหนือ">☀️ ภาคตะวันออกเฉียงเหนือ</option>
                        <option value="ภาคเหนือ">⛰️ ภาคเหนือ</option>
                        <option value="ภาคใต้">🏝️ ภาคใต้</option>
                        <option value="เฉพาะกิจ">🚚 เฉพาะกิจ</option>
                      </select>
                    </div>

                    <select
                      value={issueOffice}
                      onChange={(e) => setIssueOffice(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium text-slate-900"
                    >
                      <option value={currentOfficeName}>
                        📍 {currentOfficeName} (สำนักงานปัจจุบัน)
                      </option>
                      {groupedOffices.map((group) => (
                        <optgroup key={group.region} label={group.regionLabel}>
                          {group.offices.map((o) => (
                            <option
                              key={o.id}
                              value={o.centerName ? `${o.name} (${o.centerName})` : o.name}
                            >
                              {o.name} {o.centerName ? `• ${o.centerName}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* 2. หัวข้อปัญหา */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        หัวข้อข้อขัดข้อง <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={issueTitle}
                      onChange={(e) => setIssueTitle(e.target.value)}
                      placeholder="เช่น เครื่องพิมพ์บัตรขัดข้อง, ยอดคิวไม่ตรง, เน็ตไม่ซิงก์"
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                    />
                  </div>

                  {/* 3. รายละเอียด */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        รายละเอียดข้อขัดข้องและอาการที่พบ <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      placeholder="ระบุอาการที่พบ เวลาที่เกิด หรือจุดที่ระบบทำงานไม่ถูกต้อง..."
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium leading-relaxed"
                    />
                  </div>

                  {/* 4. ข้อมูลติดต่อกลับ */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-rose-500" />
                        <span>
                          ชื่อและเบอร์โทรศัพท์ผู้แจ้ง <span className="text-rose-500">*</span>
                        </span>
                      </span>
                      <span className="text-[10.5px] text-rose-600 font-semibold">
                        (บังคับกรอกให้ครบทั้ง 2 ช่อง)
                      </span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        value={issueReporterName}
                        onChange={(e) => {
                          setIssueReporterName(e.target.value);
                          if (contactError) setContactError('');
                        }}
                        placeholder="ชื่อ-นามสกุลผู้แจ้ง *"
                        className={`w-full text-xs px-3 py-2 bg-slate-50 border rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 font-medium ${
                          contactError && !issueReporterName.trim()
                            ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/40'
                            : 'border-slate-200 focus:ring-rose-500'
                        }`}
                      />
                      <input
                        type="tel"
                        required
                        value={issueReporterPhone}
                        onChange={(e) => {
                          setIssueReporterPhone(e.target.value);
                          if (contactError) setContactError('');
                        }}
                        placeholder="เบอร์โทรศัพท์ (เช่น 081-xxx-xxxx) *"
                        className={`w-full text-xs px-3 py-2 bg-slate-50 border rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 font-medium ${
                          contactError && issueReporterPhone.replace(/\D/g, '').length < 9
                            ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/40'
                            : 'border-slate-200 focus:ring-rose-500'
                        }`}
                      />
                    </div>

                    {contactError ? (
                      <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{contactError}</span>
                      </p>
                    ) : (
                      !isContactComplete &&
                      (issueReporterName.trim().length > 0 ||
                        issueReporterPhone.trim().length > 0) && (
                        <p className="text-[10.5px] text-amber-700 font-semibold">
                          * กรุณาระบุให้ครบทั้งชื่อผู้แจ้งและเบอร์โทรศัพท์ (อย่างน้อย 9 หลัก) จึงจะสามารถกดส่งเรื่องได้
                        </p>
                      )
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      isSubmittingIssue ||
                      !issueTitle.trim() ||
                      !issueDescription.trim() ||
                      !isContactComplete
                    }
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {isSubmittingIssue
                        ? 'กำลังส่งข้อมูล...'
                        : !isContactComplete
                        ? 'กรุณากรอกชื่อและเบอร์โทรให้ครบก่อนส่งแจ้ง'
                        : 'ส่งเรื่องแจ้งข้อขัดข้องทันที'}
                    </span>
                  </button>
                </form>

                {/* 3. รายการประวัติข้อขัดข้องที่เคยแจ้ง */}
                {myIssues.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>ประวัติข้อขัดข้องที่แจ้งไว้ ({myIssues.length} รายการ)</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearAllIssues}
                        className="text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-0.5 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        title="ล้างประวัติข้อขัดข้องทั้งหมด"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>ล้างทั้งหมด</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {myIssues.map((iss) => renderIssueCard(iss))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
