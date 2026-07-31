import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LegalContent } from '@/content/legalContent';

export default function TermsOfServicePage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>利用規約・プライバシーポリシー</CardTitle>
          <CardDescription>本サービスの利用規約およびプライバシーポリシーの全文です。</CardDescription>
        </CardHeader>
        <CardContent>
          <LegalContent />
          <p className="mt-6 text-center text-sm">
            <Link to="/dashboard" className="text-primary underline-offset-4 hover:underline">
              ダッシュボードに戻る
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
