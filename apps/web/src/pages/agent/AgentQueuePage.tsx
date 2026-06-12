import Layout from '../../components/Layout';

export default function AgentQueuePage() {
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tickets assigned to you — sorted by SLA urgency
        </p>
      </div>

      {/* Placeholder — will be replaced with real data in next sprint */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col
                      items-center justify-center text-gray-400">
        <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        <p className="text-sm font-medium">Agent queue coming in next sprint</p>
        <p className="text-xs mt-1">Assigned tickets + SLA countdown + quick transitions</p>
      </div>
    </Layout>
  );
}
