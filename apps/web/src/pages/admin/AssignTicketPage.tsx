import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Agent { id: string; name: string; email: string; department?: string }
interface Category { id: string; name: string }
interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  category: { id: string; name: string } | null;
  requester: { id: string; name: string; email: string };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export default function AssignTicketPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');

  const { data: ticket, isLoading: ticketLoading } = useQuery<Ticket>({
    queryKey: ['ticket', id],
    queryFn: () => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/users', { params: { role: 'AGENT' } }).then(r => r.data),
    staleTime: Infinity,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then(r => r.data),
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
    onError: () => setError('Assignment failed. Please try again.'),
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
        <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
          Loading ticket…
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-gray-400">
          <p className="text-sm text-red-500">Ticket not found.</p>
          <Link to="/admin/tickets" className="mt-3 text-sm text-indigo-600 hover:underline">
            ← Back to admin queue
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/admin/tickets" className="text-sm text-indigo-600 hover:underline">
          ← Back to admin queue
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50
                         border border-indigo-200 rounded px-2 py-1">
          {ticket.id}
        </span>
        <h1 className="text-xl font-bold text-gray-900 truncate">{ticket.subject}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket summary */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Ticket Info
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Requester</dt>
              <dd className="text-gray-800">{ticket.requester.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Priority</dt>
              <dd className="text-gray-800">{ticket.priority}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Category</dt>
              <dd className="text-gray-800">{ticket.category?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Status</dt>
              <dd className="text-gray-800">{ticket.status}</dd>
            </div>
          </dl>
        </div>

        {/* Assign form */}
        <div className="lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
          >
            <h2 className="text-base font-semibold text-gray-900">Assign Ticket</h2>

            {/* Agent */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to <span className="text-red-500">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                disabled={agentsLoading}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-400"
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

            {/* Priority override */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Priority{' '}
                <span className="text-gray-400 font-normal text-xs">(optional — leave blank to keep current)</span>
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Keep current ({ticket.priority})</option>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Category override */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Category{' '}
                <span className="text-gray-400 font-normal text-xs">(optional)</span>
              </label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Keep current ({ticket.category?.name ?? 'None'})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {assignMutation.isError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error || 'Assignment failed. Please try again.'}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={assignMutation.isPending}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                           hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign Ticket'}
              </button>
              <Link
                to="/admin/tickets"
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                           hover:bg-gray-50 transition-colors"
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
