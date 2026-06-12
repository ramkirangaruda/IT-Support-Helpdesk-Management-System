import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout';

export default function AssignTicketPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/admin/tickets" className="text-sm text-indigo-600 hover:underline">
          ← Back to admin queue
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50
                         border border-indigo-200 rounded px-2 py-0.5">{id}</span>
        <h1 className="text-2xl font-bold text-gray-900">Assign Ticket</h1>
      </div>

      <div className="max-w-lg bg-white rounded-xl border border-gray-200 p-8 flex flex-col
                      items-center justify-center text-gray-400">
        <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p className="text-sm font-medium">Assign form coming in next sprint</p>
        <p className="text-xs mt-1">Agent picker with POST /tickets/:id/assign</p>
      </div>
    </Layout>
  );
}
