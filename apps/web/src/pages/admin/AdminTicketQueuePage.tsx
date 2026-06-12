import Layout from '../../components/Layout';

export default function AdminTicketQueuePage() {
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Ticket Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          All open tickets — assign, escalate, and manage SLA
        </p>
      </div>

      {/* Placeholder — will be replaced with real data + filters in next sprint */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col
                      items-center justify-center text-gray-400">
        <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <p className="text-sm font-medium">Admin queue coming in next sprint</p>
        <p className="text-xs mt-1">Filters by status / priority / assignee, bulk assign</p>
      </div>
    </Layout>
  );
}
