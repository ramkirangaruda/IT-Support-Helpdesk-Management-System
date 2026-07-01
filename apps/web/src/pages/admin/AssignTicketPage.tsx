import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Agent    { id: string; name: string; email: string; department?: string }
interface Category { id: string; name: string }
interface Ticket {
  id:          string;
  subject:     string;
  description: string;
  priority:    string;
  status:      string;
  category:    { id: string; name: string } | null;
  requester:   { id: string; name: string; email: string };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{message}</p>;
}

const selectCls = `w-full rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                   focus:outline-none focus:border-2 focus:border-indigo-600
                   disabled:bg-[#f2f2f7] disabled:text-ink-muted`;

export default function AssignTicketPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assigneeId,  setAssigneeId]  = useState('');
  const [priority,    setPriority]    = useState('');
  const [categoryId,  setCategoryId]  = useState('');
  const [error,       setError]       = useState('');

  const { data: ticket, isLoading: ticketLoading } = useQuery<Ticket>({
    queryKey: ['ticket', id],
    queryFn:  () => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ['agents-and-l2'],
    queryFn:  () => api.get<Agent[]>('/users', { params: { roles: 'AGENT,L2_L3' } }).then(r => r.data),
    staleTime: Infinity,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post(`/tickets/${id}/assign`, {
        assigneeId,
        ...(priority   && { priority }),
        ...(categoryId && { categoryId }),
      }).then(r => r.data),
    onSuccess: () => navigate(`/tickets/${id}`),
    onError:   () => setError('Assignment failed. Please try again.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigneeId) { setError('Please select an agent.'); return; }
    setError('');
    assignMutation.mutate();
  };

  if (ticketLoading) {
    return (
      <Layout>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8 animate-pulse">
          <div className="bg-white rounded-xl border border-hair h-40" />
          <div className="lg:col-span-2 bg-white rounded-xl border border-hair h-80" />
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-ink-muted gap-3">
          <p className="text-sm text-[#c0392b]">Ticket not found.</p>
          <Link to="/admin/tickets" className="text-sm text-indigo-600 hover:underline">
            ← Back to admin queue
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/admin/tickets" className="text-sm text-ink-muted hover:text-indigo-600">
          ← Back to admin queue
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <span className="ticket-id shrink-0">{ticket.id}</span>
        <h1 className="text-[22px] font-semibold text-ink truncate">{ticket.subject}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket summary */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-hair p-5 h-fit">
          <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-3">
            Ticket Info
          </h2>
          <dl className="space-y-2.5 text-sm">
            {[
              { label: 'Requester', value: ticket.requester.name },
              { label: 'Priority',  value: ticket.priority },
              { label: 'Category',  value: ticket.category?.name ?? '—' },
              { label: 'Status',    value: ticket.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">{label}</dt>
                <dd className="text-ink mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Assign form */}
        <div className="lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-hair p-6 space-y-5"
          >
            <h2 className="text-base font-semibold text-ink">Assign Ticket</h2>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Assign to <span className="text-[#c0392b]">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                disabled={agentsLoading}
                className={selectCls}
              >
                <option value="">{agentsLoading ? 'Loading…' : 'Select agent…'}</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.email}{a.department ? ` (${a.department})` : ''}
                  </option>
                ))}
              </select>
              {!assigneeId && error && <FieldError message={error} />}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Override Priority{' '}
                <span className="text-ink-muted font-normal text-xs">(optional)</span>
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className={selectCls}
              >
                <option value="">Keep current ({ticket.priority})</option>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Override Category{' '}
                <span className="text-ink-muted font-normal text-xs">(optional)</span>
              </label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={selectCls}
              >
                <option value="">Keep current ({ticket.category?.name ?? 'None'})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {assignMutation.isError && (
              <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3 text-sm text-[#c0392b]">
                {error || 'Assignment failed. Please try again.'}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={assignMutation.isPending}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50"
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign Ticket'}
              </button>
              <Link
                to="/admin/tickets"
                className="px-4 py-2.5 rounded-lg border border-hair text-sm text-ink-soft
                           hover:bg-[#fafafa]"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
