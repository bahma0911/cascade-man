import React from 'react';

/**
 * Responsive SVG Line Chart for revenue and profit trends
 */
export function SimpleLineChart({
  data = [],
  xKey = 'date',
  yKey = 'revenue',
  height = 200,
  strokeColor = '#d97706',
  unit = '',
}) {
  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-xs text-gray-400">No trend data available</div>;
  }

  const values = data.map((d) => Number(d[yKey]) || 0);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(10, ...values);
  const range = maxVal - minVal || 1;

  const width = 600;
  const paddingX = 40;
  const paddingY = 25;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = data.map((d, idx) => {
    const x = paddingX + (idx / Math.max(1, data.length - 1)) * chartWidth;
    const y = height - paddingY - ((Number(d[yKey]) - minVal) / range) * chartHeight;
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[320px]">
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = paddingY + pct * chartHeight;
          const val = Math.round(maxVal - pct * range);
          return (
            <g key={i}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f3f4f6" strokeDasharray="3 3" />
              <text x={paddingX - 6} y={y + 3} textAnchor="end" className="text-[9px] fill-gray-400 font-medium">
                {val}
              </text>
            </g>
          );
        })}

        {/* Line path */}
        <path d={pathData} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {data.map((d, idx) => {
          const x = paddingX + (idx / Math.max(1, data.length - 1)) * chartWidth;
          const y = height - paddingY - ((Number(d[yKey]) - minVal) / range) * chartHeight;
          return (
            <g key={idx} className="group">
              <circle cx={x} cy={y} r="4" fill="#ffffff" stroke={strokeColor} strokeWidth="2" className="transition-transform group-hover:scale-125" />
              <text x={x} y={height - 5} textAnchor="middle" className="text-[9px] fill-gray-400 font-medium">
                {d[xKey]?.length > 7 ? d[xKey].slice(5) : d[xKey]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Responsive Vertical Bar Chart
 */
export function SimpleBarChart({
  data = [],
  xKey = 'date',
  yKey = 'orderCount',
  height = 200,
  barColor = '#3b82f6',
}) {
  if (!data || data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-xs text-gray-400">No chart data</div>;
  }

  const values = data.map((d) => Number(d[yKey]) || 0);
  const maxVal = Math.max(5, ...values);

  const width = 600;
  const paddingX = 40;
  const paddingY = 25;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const barWidth = Math.min(30, (chartWidth / data.length) * 0.6);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[320px]">
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = paddingY + pct * chartHeight;
          const val = Math.round(maxVal - pct * maxVal);
          return (
            <g key={i}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f3f4f6" strokeDasharray="3 3" />
              <text x={paddingX - 6} y={y + 3} textAnchor="end" className="text-[9px] fill-gray-400">
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, idx) => {
          const val = Number(d[yKey]) || 0;
          const barH = (val / maxVal) * chartHeight;
          const x = paddingX + (idx + 0.5) * (chartWidth / data.length) - barWidth / 2;
          const y = height - paddingY - barH;

          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="4"
                fill={barColor}
                className="opacity-90 hover:opacity-100 transition-opacity"
              />
              <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" className="text-[9px] fill-gray-500 font-medium">
                {d[xKey]?.length > 7 ? d[xKey].slice(5) : d[xKey]}
              </text>
              {val > 0 && (
                <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="text-[9px] fill-gray-700 font-bold">
                  {val}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Horizontal Progress Bar Chart for Top-selling Items
 */
export function HorizontalBarChart({ data = [], nameKey = 'name', valKey = 'totalRevenue', unit = 'ETB' }) {
  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-xs text-gray-400">No items available</div>;
  }

  const maxVal = Math.max(1, ...data.map((d) => Number(d[valKey]) || 0));

  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const val = Number(item[valKey]) || 0;
        const pct = Math.round((val / maxVal) * 100);

        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-800 truncate max-w-[200px] sm:max-w-xs">
                {idx + 1}. {item[nameKey]}
              </span>
              <span className="font-extrabold text-gray-900">
                {val.toLocaleString()} {unit}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-amber-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Doughnut / Pie Chart for Category Breakdown
 */
export function DoughnutCategoryChart({ data = [] }) {
  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-xs text-gray-400">No category breakdown</div>;
  }

  const colors = ['#d97706', '#2563eb', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#4b5563'];
  const total = data.reduce((sum, d) => sum + (Number(d.totalRevenue) || 0), 0);

  let cumulativePct = 0;
  const slices = data.map((d, i) => {
    const val = Number(d.totalRevenue) || 0;
    const pct = total > 0 ? (val / total) * 100 : 0;
    const offset = cumulativePct;
    cumulativePct += pct;
    return {
      category: d.category,
      val,
      pct: pct.toFixed(1),
      color: colors[i % colors.length],
      offset,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-2">
      {/* SVG Ring */}
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-36 h-36 -rotate-90">
          {slices.map((slice, i) => (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.91549430918954"
              fill="transparent"
              stroke={slice.color}
              strokeWidth="4"
              strokeDasharray={`${slice.pct} ${100 - slice.pct}`}
              strokeDashoffset={-slice.offset}
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <div className="absolute text-center">
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Total</span>
          <span className="text-xs font-black text-gray-900">{total.toLocaleString()}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2 flex-1 max-w-xs">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="font-semibold text-gray-700 capitalize">{slice.category}</span>
            </div>
            <div className="font-bold text-gray-900">
              {slice.pct}% <span className="text-gray-400 font-normal">({slice.val.toLocaleString()})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

