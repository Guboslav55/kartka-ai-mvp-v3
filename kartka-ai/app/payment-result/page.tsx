'use client';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function SuccessContent() {
  const params = useSearchParams();
  const payment = params.get('payment');

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="font-display font-black text-2xl text-gold block mb-12">
          Картка<span className="text-white">АІ</span>
        </Link>

        {payment === 'success' ? (
          <div className="bg-white/[0.04] border border-green-500/30 rounded-2xl p-10">
            <div className="text-6xl mb-5">🎉</div>
            <h1 className="font-display font-black text-2xl mb-3 text-white">Оплата пройшла!</h1>
            <p className="text-white/50 text-sm mb-2">Твій тариф активовано. Карточки вже на балансі.</p>
            <p className="text-white/30 text-xs mb-8">Якщо баланс ще не оновився — зачекай хвилину та оновіть сторінку.</p>
            <Link href="/generate"
              className="block bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors mb-3">
              ✦ Генерувати першу картку
            </Link>
            <Link href="/dashboard" className="block text-white/40 text-sm hover:text-white transition-colors">
              → До кабінету
            </Link>
          </div>
        ) : (
          <div className="bg-white/[0.04] border border-red-500/30 rounded-2xl p-10">
            <div className="text-6xl mb-5">⚠️</div>
            <h1 className="font-display font-bold text-xl mb-3">Щось пішло не так</h1>
            <p className="text-white/50 text-sm mb-8">Оплата не пройшла або була скасована. Кошти не списані.</p>
            <Link href="/pricing"
              className="block bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors mb-3">
              Спробувати ще раз
            </Link>
            <Link href="/dashboard" className="block text-white/40 text-sm hover:text-white transition-colors">
              → До кабінету
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/40">Завантаження...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
