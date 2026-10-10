"use client";

// Recharts is large, so the analytics page loads these charts in their own
// chunk (see client.tsx). Each chart renders at a fixed 250px height.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { AnalyticsData } from "@/actions/analytics";

const PIE_COLORS = ["#2d3a2e", "#3d5a3e", "#7a9a7c", "#b5c2b6", "#c9a86a", "#8a8f88"];

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid rgba(45, 58, 46, 0.15)",
  borderRadius: "0.6rem",
  color: "#2d3a2e",
  boxShadow: "0 10px 30px rgba(45, 58, 46, 0.18)",
};

export function QuestionsTrendChart({ data }: { data: AnalyticsData["dailyData"] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data}>
        <defs>
          <linearGradient
            id="questionsGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#4682b4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#4682b4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="oklch(1 0 0 / 8%)"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "#536872", fontSize: 12 }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#536872", fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) =>
            new Date(v).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <Area
          type="monotone"
          dataKey="questions"
          stroke="#4682b4"
          fill="url(#questionsGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DocumentTypesChart({ data }: { data: AnalyticsData["documentTypes"] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="type"
          outerRadius={100}
          label={(props) => {
            const name = props.name ?? "";
            const percent = typeof props.percent === "number" ? props.percent : 0;
            return `${name} ${(percent * 100).toFixed(0)}%`;
          }}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function QuestionsByHourChart({ data }: { data: AnalyticsData["hourlyDistribution"] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="oklch(1 0 0 / 8%)"
        />
        <XAxis
          dataKey="hour"
          tick={{ fill: "#536872", fontSize: 12 }}
          tickFormatter={(h) => `${h}:00`}
        />
        <YAxis
          tick={{ fill: "#536872", fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(h) => `${h}:00 – ${h}:59`}
        />
        <Bar
          dataKey="count"
          fill="#536872"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UserGrowthChart({ data }: { data: AnalyticsData["userGrowth"] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="oklch(1 0 0 / 8%)"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "#536872", fontSize: 12 }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#536872", fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) =>
            new Date(v).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <Line
          type="monotone"
          dataKey="users"
          stroke="#e5e4e2"
          strokeWidth={2}
          dot={{ fill: "#c0c0c0", r: 3 }}
          activeDot={{ fill: "#4682b4", r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
