export default function PerformanceIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ribbons / Tails */}
      <path
        d="M7.5 13.5L5.5 21.5L12 18.5L18.5 21.5L16.5 13.5"
        fill="url(#perfRibbonGrad)"
        stroke="#4338CA"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Main Medal Outer Rim */}
      <circle
        cx="12"
        cy="8.5"
        r="6.5"
        fill="url(#perfMedalGrad)"
        stroke="#B45309"
        strokeWidth="1.2"
      />
      {/* Etched Inner Ring */}
      <circle
        cx="12"
        cy="8.5"
        r="5.2"
        fill="none"
        stroke="#FEF3C7"
        strokeWidth="0.8"
        strokeDasharray="1.5 1"
      />
      {/* 3D Star Insignia */}
      <path
        d="M12 4.6L13.2 7.2L16 7.6L14 9.5L14.5 12.2L12 10.9L9.5 12.2L10 9.5L8 7.6L10.8 7.2L12 4.6Z"
        fill="#FFFBEB"
        stroke="#D97706"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="perfMedalGrad"
          x1="6"
          y1="2"
          x2="18"
          y2="15"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FBBF24" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <linearGradient
          id="perfRibbonGrad"
          x1="5.5"
          y1="13.5"
          x2="18.5"
          y2="21.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
    </svg>
  );
}
