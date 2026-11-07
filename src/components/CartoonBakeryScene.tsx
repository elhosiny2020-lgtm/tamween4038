import React, { useState } from 'react';

export const CartoonBakeryScene: React.FC = () => {
  const [bakerWaving, setBakerWaving] = useState(false);

  return (
    <div className="relative w-full max-w-lg mx-auto flex flex-col items-center justify-center select-none py-2">
      {/* Main Cartoon Stage with The Master Baker (عم عويس) */}
      <div className="relative w-full h-56 md:h-64 flex items-end justify-center">
        {/* Floating Cartoon Background Elements (Wheat, stars) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Animated Cartoon Wheat 1 */}
          <div className="absolute top-2 left-10 text-2xl animate-pulse opacity-80" style={{ animationDuration: '3s' }}>
            🌾
          </div>
          {/* Animated Cartoon Wheat 2 */}
          <div className="absolute top-10 right-10 text-2xl animate-pulse opacity-80" style={{ animationDuration: '2.5s' }}>
            🌾
          </div>
          {/* Cartoon Sparkles */}
          <div className="absolute top-4 left-1/4 text-amber-300 text-lg animate-ping" style={{ animationDuration: '2s' }}>
            ✨
          </div>
          <div className="absolute top-12 right-1/4 text-amber-300 text-lg animate-ping" style={{ animationDuration: '2.8s' }}>
            ⭐
          </div>
          {/* Floating mini bread */}
          <div className="absolute top-16 left-16 text-xl animate-bounce opacity-70" style={{ animationDuration: '4s' }}>
            🥖
          </div>
        </div>

        {/* Center Star: The Smiling Master Baker ("عم عويس الخباز البلدي") */}
        <div
          onMouseEnter={() => setBakerWaving(true)}
          onMouseLeave={() => setBakerWaving(false)}
          onClick={() => setBakerWaving(!bakerWaving)}
          className="relative z-20 cursor-pointer group transform hover:scale-105 transition-transform duration-300"
        >
          <svg width="160" height="185" viewBox="0 0 160 190" className="drop-shadow-2xl">
            {/* Steam waves from bread */}
            <g className="animate-pulse" style={{ animationDuration: '1.5s' }}>
              <path d="M 120,70 Q 125,55 120,45" fill="none" stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
              <path d="M 130,68 Q 135,50 130,38" fill="none" stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            </g>

            {/* Baker Body / Apron */}
            <path d="M 50,110 L 40,180 Q 80,188 120,180 L 110,110 Z" fill="#F8FAFC" stroke="#334155" strokeWidth="3.5" />
            {/* Red Scarf / Neckerchief */}
            <path d="M 62,110 Q 80,126 98,110 L 90,102 Q 80,112 70,102 Z" fill="#DC2626" />

            {/* Left Arm holding Peel */}
            <path d="M 45,115 Q 30,135 60,145" fill="none" stroke="#FED7AA" strokeWidth="12" strokeLinecap="round" />

            {/* Right Arm waving or holding bread */}
            <path
              d={bakerWaving ? 'M 115,115 Q 140,85 145,65' : 'M 112,118 Q 130,130 115,145'}
              fill="none"
              stroke="#FED7AA"
              strokeWidth="12"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            {/* Waving Hand */}
            {bakerWaving && (
              <circle cx="145" cy="62" r="7" fill="#FED7AA" className="animate-spin" style={{ animationDuration: '0.8s' }} />
            )}

            {/* Wooden Bread Peel (المطرحة) */}
            <path d="M 30,150 L 135,130" stroke="#78350F" strokeWidth="6" strokeLinecap="round" />
            <ellipse cx="125" cy="132" rx="20" ry="12" fill="#D97706" stroke="#92400E" strokeWidth="2.5" />

            {/* Hot Baladi Bread Loaf on Peel */}
            <ellipse cx="125" cy="128" rx="16" ry="9" fill="#FBBF24" stroke="#B45309" strokeWidth="2" />
            <path d="M 115,126 Q 125,122 135,126" stroke="#92400E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            {/* Sesame seeds on loaf */}
            <circle cx="122" cy="127" r="0.8" fill="#FFF" />
            <circle cx="127" cy="126" r="0.8" fill="#FFF" />
            <circle cx="131" cy="128" r="0.8" fill="#FFF" />

            {/* Head */}
            <circle cx="80" cy="85" r="28" fill="#FED7AA" stroke="#78350F" strokeWidth="3" />
            {/* Rosy Cheeks */}
            <circle cx="63" cy="94" r="6" fill="#FCA5A5" opacity="0.9" />
            <circle cx="97" cy="94" r="6" fill="#FCA5A5" opacity="0.9" />

            {/* Cute Big Cartoon Eyes */}
            <ellipse cx="68" cy="80" rx="5" ry="7" fill="#1E293B" />
            <circle cx="70" cy="78" r="2.2" fill="#FFFFFF" />
            <circle cx="66" cy="83" r="1.2" fill="#FFFFFF" />

            <ellipse cx="92" cy="80" rx="5" ry="7" fill="#1E293B" />
            <circle cx="94" cy="78" r="2.2" fill="#FFFFFF" />
            <circle cx="90" cy="83" r="1.2" fill="#FFFFFF" />

            {/* Friendly Eyebrows */}
            <path d="M 62,70 Q 68,66 74,70" fill="none" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 86,70 Q 92,66 98,70" fill="none" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />

            {/* Cute Egyptian Mustache */}
            <path
              d="M 65,95 Q 74,90 80,95 Q 86,90 95,95 Q 88,102 80,98 Q 72,102 65,95 Z"
              fill="#78350F"
            />

            {/* Big Cheerful Smile */}
            <path d="M 72,100 Q 80,109 88,100" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />

            {/* Tall Baker Chef Hat (طاقية الخباز البيضاء) */}
            <g className="animate-bounce" style={{ animationDuration: '3s' }}>
              <path
                d="M 52,65 Q 40,35 60,25 Q 80,10 100,25 Q 120,35 108,65 Z"
                fill="#FFFFFF"
                stroke="#334155"
                strokeWidth="3"
              />
              {/* Hat Creases */}
              <path d="M 68,62 Q 65,35 75,25" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
              <path d="M 82,60 Q 83,30 87,22" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
              <path d="M 94,62 Q 97,35 95,26" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
              {/* Hat Band with Egyptian Golden Eagle pin */}
              <rect x="52" y="60" width="56" height="8" rx="2" fill="#D97706" />
              <circle cx="80" cy="64" r="3" fill="#FDE68A" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
