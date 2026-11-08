import React, { useState } from 'react';
import { Sparkles, Utensils, Award } from 'lucide-react';

export const CartoonBakeryScene: React.FC = () => {
  const [bakerWaving, setBakerWaving] = useState(false);
  const [isOvenGlowing, setIsOvenGlowing] = useState(true);

  return (
    <div className="relative w-full max-w-lg mx-auto flex flex-col items-center justify-center select-none py-2">
      {/* Background Animated Glowing Ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-amber-500/20 via-red-500/10 to-amber-300/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* Main Cartoon Stage with The Master Baker (الشيخ عويس - كبير الخبازين) */}
      <div className="relative w-full h-60 md:h-64 flex items-end justify-center">
        {/* Floating Cartoon Background Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Wheat Sheaves */}
          <div className="absolute top-2 left-6 text-3xl animate-bounce opacity-90" style={{ animationDuration: '3.2s' }}>
            🌾
          </div>
          <div className="absolute top-6 right-8 text-3xl animate-bounce opacity-90" style={{ animationDuration: '2.8s' }}>
            🌾
          </div>

          {/* Sparkles */}
          <div className="absolute top-4 left-1/4 text-amber-300 text-xl animate-ping" style={{ animationDuration: '2.2s' }}>
            ✨
          </div>
          <div className="absolute top-10 right-1/4 text-amber-400 text-xl animate-ping" style={{ animationDuration: '2.6s' }}>
            ⭐
          </div>

          {/* Floating Fresh Bread Loaves */}
          <div className="absolute top-16 left-12 text-2xl animate-pulse opacity-80" style={{ animationDuration: '4s' }}>
            🫓
          </div>
          <div className="absolute top-20 right-12 text-2xl animate-pulse opacity-80" style={{ animationDuration: '3.5s' }}>
            🥖
          </div>
        </div>

        {/* Center Character: The Master Baker ("الشيخ عويس - الخباز التمويني الماهر") */}
        <div
          onMouseEnter={() => setBakerWaving(true)}
          onMouseLeave={() => setBakerWaving(false)}
          onClick={() => {
            setBakerWaving(!bakerWaving);
            setIsOvenGlowing(!isOvenGlowing);
          }}
          className="relative z-20 cursor-pointer group transform hover:scale-108 transition-all duration-300"
          title="انقر لإلقاء التحية على الخباز الماهر وجعل الفرن متوهجاً!"
        >
          <svg width="180" height="200" viewBox="0 0 180 200" className="drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]">
            {/* Animated Steam Waves Rising from Fresh Baladi Bread */}
            <g className="animate-pulse" style={{ animationDuration: '1.4s' }}>
              <path d="M 135,75 Q 140,60 135,48" fill="none" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
              <path d="M 148,72 Q 153,52 148,40" fill="none" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
              <path d="M 122,78 Q 127,62 122,50" fill="none" stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            </g>

            {/* Glowing Traditional Egyptian Brick Oven in Background */}
            <path
              d="M 20,180 Q 20,100 90,100 Q 160,100 160,180 Z"
              fill="#1E1B18"
              stroke="#B45309"
              strokeWidth="4"
              opacity="0.4"
            />
            <path
              d="M 45,180 Q 45,130 90,130 Q 135,130 135,180 Z"
              fill={isOvenGlowing ? 'url(#ovenGlowGradient)' : '#451A03'}
              stroke="#D97706"
              strokeWidth="3"
            />

            {/* SVG Gradients */}
            <defs>
              <radialGradient id="ovenGlowGradient" cx="50%" cy="80%" r="60%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="1" />
                <stop offset="50%" stopColor="#DC2626" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#451A03" stopOpacity="0.6" />
              </radialGradient>
              <linearGradient id="hatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#F1F5F9" />
              </linearGradient>
            </defs>

            {/* Baker Body & Crisp White Apron */}
            <path d="M 55,120 L 42,192 Q 90,200 138,192 L 125,120 Z" fill="#F8FAFC" stroke="#334155" strokeWidth="4" />
            {/* Egyptian Official Ministry Badge on Apron */}
            <rect x="80" y="145" width="20" height="24" rx="4" fill="#D97706" stroke="#FEF08A" strokeWidth="1.5" />
            <circle cx="90" cy="154" r="5" fill="#FEF08A" />
            <path d="M 86,162 L 94,162" stroke="#FEF08A" strokeWidth="1.5" />

            {/* Red Egyptian Scarf / Neckerchief */}
            <path d="M 68,118 Q 90,136 112,118 L 102,110 Q 90,122 78,110 Z" fill="#DC2626" stroke="#991B1B" strokeWidth="2" />

            {/* Left Arm holding Wooden Peel */}
            <path d="M 50,125 Q 32,148 68,158" fill="none" stroke="#FED7AA" strokeWidth="13" strokeLinecap="round" />

            {/* Right Arm Waving or Welcoming */}
            <path
              d={bakerWaving ? 'M 130,125 Q 158,92 162,70' : 'M 128,128 Q 148,142 130,158'}
              fill="none"
              stroke="#FED7AA"
              strokeWidth="13"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            {/* Waving Hand Sparkle Effect */}
            {bakerWaving && (
              <circle cx="162" cy="66" r="8" fill="#FDE68A" className="animate-ping" style={{ animationDuration: '0.8s' }} />
            )}

            {/* Wooden Bread Peel (المطرحة الخشبية) */}
            <path d="M 32,165 L 152,142" stroke="#78350F" strokeWidth="7" strokeLinecap="round" />
            <ellipse cx="140" cy="144" rx="23" ry="14" fill="#D97706" stroke="#92400E" strokeWidth="3" />

            {/* Fresh Piping Hot Egyptian Baladi Loaf on Peel */}
            <ellipse cx="140" cy="140" rx="19" ry="10" fill="#FBBF24" stroke="#B45309" strokeWidth="2.5" />
            <path d="M 128,138 Q 140,133 152,138" stroke="#92400E" strokeWidth="2" fill="none" strokeLinecap="round" />
            {/* Sesame & Wheat Bran Texture on Bread */}
            <circle cx="135" cy="139" r="1" fill="#FFFFFF" />
            <circle cx="141" cy="137" r="1" fill="#FFFFFF" />
            <circle cx="146" cy="140" r="1" fill="#FFFFFF" />
            <circle cx="138" cy="142" r="1" fill="#92400E" />

            {/* Chef's Face */}
            <circle cx="90" cy="92" r="30" fill="#FED7AA" stroke="#78350F" strokeWidth="3.5" />
            {/* Cheerful Rosy Cheeks */}
            <circle cx="71" cy="102" r="7" fill="#FCA5A5" opacity="0.9" />
            <circle cx="109" cy="102" r="7" fill="#FCA5A5" opacity="0.9" />

            {/* Cute Cartoon Eyes with Highlights */}
            <ellipse cx="76" cy="87" rx="6" ry="8" fill="#1E293B" />
            <circle cx="78" cy="84" r="2.5" fill="#FFFFFF" />
            <circle cx="74" cy="89" r="1.5" fill="#FFFFFF" />

            <ellipse cx="104" cy="87" rx="6" ry="8" fill="#1E293B" />
            <circle cx="106" cy="84" r="2.5" fill="#FFFFFF" />
            <circle cx="102" cy="89" r="1.5" fill="#FFFFFF" />

            {/* Friendly Eyebrows */}
            <path d="M 70,76 Q 77,72 84,76" fill="none" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
            <path d="M 96,76 Q 103,72 110,76" fill="none" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />

            {/* Signature Egyptian Master Moustache */}
            <path
              d="M 73,103 Q 83,97 90,103 Q 97,97 107,103 Q 99,111 90,107 Q 81,111 73,103 Z"
              fill="#78350F"
            />

            {/* Big Smile */}
            <path d="M 81,109 Q 90,119 99,109" fill="none" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />

            {/* Tall White Master Chef / Baker Hat */}
            <g className="animate-bounce" style={{ animationDuration: '3.5s' }}>
              <path
                d="M 58,72 Q 42,38 66,26 Q 90,8 114,26 Q 138,38 122,72 Z"
                fill="url(#hatGradient)"
                stroke="#334155"
                strokeWidth="3.5"
              />
              {/* Hat Creases */}
              <path d="M 76,68 Q 72,38 83,28" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
              <path d="M 92,66 Q 93,32 97,24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
              <path d="M 106,68 Q 109,38 107,28" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
              {/* Golden Hat Band with Eagle Emblem */}
              <rect x="58" y="66" width="64" height="9" rx="2.5" fill="#D97706" />
              <circle cx="90" cy="70.5" r="3.5" fill="#FEF08A" stroke="#B45309" strokeWidth="1" />
            </g>
          </svg>
        </div>
      </div>

      {/* Interactive Title Tag */}
      <div className="mt-3 flex items-center gap-2 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border border-amber-500/50 px-4 py-1.5 rounded-full text-xs font-black text-amber-300 shadow-xl backdrop-blur-md">
        <Sparkles className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
        <span>المنظومة الرقمية للمخابز البلدية المدعمة</span>
        <Award className="w-4 h-4 text-amber-400" />
      </div>
    </div>
  );
};
