import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import {
  deletePasskey,
  isPasskeySupported,
  listPasskeys,
  registerPasskey,
  type PasskeySummary,
} from '@/lib/passkey';

function formatCreatedAt(createdAt: Date | null): string {
  return createdAt ? `${createdAt.toLocaleDateString('ja-JP')} 登録` : '登録日不明';
}

export function PasskeySection({ onSuccess }: { onSuccess: (message: string) => void }) {
  const supported = isPasskeySupported();
  // null は「取得前、または取得失敗」。失敗時に「0件」と誤表示しないよう区別する。
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PasskeySummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys());
    } catch (e) {
      setPasskeys(null);
      setError(e instanceof Error ? e.message : 'パスキーの取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    // 非対応ブラウザでも、他端末で登録済みのパスキーの確認・削除はできるよう一覧は取得する。
    void refresh();
  }, [refresh]);

  async function handleRegister() {
    setIsRegistering(true);
    setError(null);
    try {
      await registerPasskey();
      onSuccess('パスキーを登録しました');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'パスキーの登録に失敗しました');
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deletePasskey(deleteTarget.credentialId);
      setDeleteTarget(null);
      onSuccess('パスキーを削除しました');
      await refresh();
    } catch (e) {
      setDeleteTarget(null);
      setError(e instanceof Error ? e.message : 'パスキーの削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">パスキー</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {passkeys === null
              ? '—'
              : passkeys.length > 0
                ? `${passkeys.length}件登録済み`
                : '未登録'}
            <InfoTooltip label="パスキーの説明">
              指紋・顔認証や画面ロックでログインできます。パスワードでのログインも引き続き使えます
            </InfoTooltip>
          </p>
        </div>
        {supported && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRegistering}
            loading={isRegistering}
            onClick={handleRegister}
          >
            追加
          </Button>
        )}
      </div>

      {!supported && (
        <p className="text-sm text-muted-foreground">
          このブラウザはパスキーに対応していないため、新しく登録できません。
        </p>
      )}

      {passkeys && passkeys.length > 0 && (
        <ul className="flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <li
              key={passkey.credentialId}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate">
                {passkey.name || 'パスキー'}
                <span className="ml-2 text-muted-foreground">
                  {formatCreatedAt(passkey.createdAt)}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(passkey)}
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="パスキーを削除しますか？"
        description="このパスキーではログインできなくなります。端末に保存されたパスキー自体は、端末側の設定から別途削除してください。"
        pending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
