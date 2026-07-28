import { CURRENT_TERMS_VERSION } from '@household/shared';

/**
 * 利用規約・プライバシーポリシーの本文。
 * 本文を実質的に変更した場合は、必ず packages/shared/src/consent.ts の
 * CURRENT_TERMS_VERSION も更新すること（さもないと既存ユーザーに再同意を要求できない）。
 */
export function TermsOfServiceContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <h3 className="text-base font-semibold">利用規約</h3>

      <section>
        <h4 className="font-medium">第1条（本規約について）</h4>
        <p>
          本規約は、本サービス（個人・家族向け家計簿Webアプリ、以下「本サービス」）の利用条件を定めるものです。
          利用登録を行った利用者（以下「利用者」）は、本規約に同意のうえ本サービスを利用するものとします。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第2条（サービス内容）</h4>
        <p>
          本サービスは、個人または家族が日々の収入・支出・予算を記録し、集計・グラフ表示によって
          家計の状況を把握するための家計簿ツールです。本サービスは個人が開発・運営するものであり、
          法人・専門業者による有償サポートは提供されません。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第3条（利用登録）</h4>
        <p>
          利用希望者は、メールアドレスとパスワードにより利用登録を行うものとします。
          1つのメールアドレスにつき1アカウントの登録を原則とし、他者へのアカウント貸与・共有は禁止します。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第4条（禁止事項）</h4>
        <p>利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
        <ul className="list-inside list-disc">
          <li>不正アクセスその他本サービスのシステムに支障を与える行為</li>
          <li>本サービスのリバースエンジニアリング、複製、改変</li>
          <li>本サービスを商用に転用・再配布する行為</li>
          <li>法令または公序良俗に違反する行為</li>
        </ul>
      </section>

      <section>
        <h4 className="font-medium">第5条（本サービスの停止・変更・終了）</h4>
        <p>
          運営者は、システムの保守・障害対応その他の事情により、事前の通知なく本サービスの提供を
          一時的に停止し、または内容を変更・終了することがあります。これにより利用者に生じた損害について、
          運営者は責任を負いません。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第6条（免責事項）</h4>
        <p>
          本サービスは現状有姿で提供され、その正確性・完全性・特定目的への適合性についていかなる保証も
          行いません。利用者が入力・記録するデータの内容については利用者自身の責任で管理するものとし、
          本サービスの利用により生じたいかなる損害（データの誤り・消失を含む）についても、運営者は
          故意または重過失がある場合を除き責任を負いません。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第7条（退会）</h4>
        <p>
          利用者はいつでも設定画面から退会を申請できます。退会操作を行った時点でアカウントは
          利用停止（論理削除）となり、以後ログインできなくなります。退会から30日程度の猶予期間の後、
          利用者のデータはバッチ処理により完全に（物理的に）削除されます。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第8条（規約の変更）</h4>
        <p>
          運営者は、必要と判断した場合、本規約およびプライバシーポリシーの内容を変更することがあります。
          内容を実質的に変更した場合、利用者は次回ログイン時に変更後の内容への同意を求められます。
          変更後の内容に同意いただけない場合、本サービスの利用を継続することはできません（第7条の退会手続きをご利用ください）。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第9条（準拠法・管轄）</h4>
        <p>
          本規約の準拠法は日本法とし、本サービスに関して紛争が生じた場合には、運営者の住所地を
          管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </section>

      <section>
        <h4 className="font-medium">第10条（お問い合わせ）</h4>
        <p>本規約に関するお問い合わせは、運営者までご連絡ください。</p>
      </section>

      <p className="text-xs text-muted-foreground">最終改定日: {CURRENT_TERMS_VERSION}</p>
    </div>
  );
}

export function PrivacyPolicyContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <h3 className="text-base font-semibold">プライバシーポリシー</h3>

      <section>
        <h4 className="font-medium">1. 基本方針</h4>
        <p>
          本サービスの運営者（以下「運営者」）は、利用者の個人情報の重要性を認識し、
          適切に取得・利用・管理することに努めます。
        </p>
      </section>

      <section>
        <h4 className="font-medium">2. 取得する情報</h4>
        <ul className="list-inside list-disc">
          <li>メールアドレス（アカウント識別・ログインのため）</li>
          <li>利用者が入力する取引・予算・費目等の家計簿データ</li>
          <li>操作ログ（誰が・いつ・何を変更したかを示す、更新系操作に関する記録）</li>
        </ul>
      </section>

      <section>
        <h4 className="font-medium">3. 利用目的</h4>
        <ul className="list-inside list-disc">
          <li>本サービスの提供・維持・改善のため</li>
          <li>利用者からのお問い合わせへの対応のため</li>
          <li>不正利用の防止・システム保守のため</li>
        </ul>
      </section>

      <section>
        <h4 className="font-medium">4. 第三者提供</h4>
        <p>運営者は、以下の場合を除き、利用者の同意なく個人情報を第三者に提供することはありません。</p>
        <ul className="list-inside list-disc">
          <li>法令に基づき開示が求められる場合</li>
          <li>
            本サービスの稼働に必要なクラウドインフラ（Amazon Web Services:
            Cognito・DynamoDB・Lambda・API Gateway・Amplify Hosting・SES等）に処理を委託する場合
            （下記「5. 委託」参照）
          </li>
        </ul>
        <p>広告配信事業者等、本サービスの提供に関与しない第三者へのデータ提供・販売は一切行いません。</p>
      </section>

      <section>
        <h4 className="font-medium">5. 委託</h4>
        <p>
          運営者は、本サービスの提供に必要な範囲で、Amazon Web
          Services（AWS）が提供するクラウドインフラ上でデータを処理します。委託先においても、
          適切なアクセス制御・暗号化等、本ポリシーに沿った安全管理が図られるよう努めます。
        </p>
      </section>

      <section>
        <h4 className="font-medium">6. データの保管期間・削除</h4>
        <p>
          利用者のデータは、アカウントが有効な間、本サービスの提供のために保管されます。
          利用者が退会した場合、退会操作の時点で速やかに論理削除（ログイン不可）とし、
          30日程度の猶予期間の経過後、バッチ処理によりデータを完全に（物理的に）削除します。
        </p>
      </section>

      <section>
        <h4 className="font-medium">7. Cookie等の利用</h4>
        <p>
          本サービスは広告配信・行動追跡を目的としたCookieやトラッキング技術は使用しません。
          ログインセッションの維持のため、認証情報をブラウザのlocalStorageに保存します。
        </p>
      </section>

      <section>
        <h4 className="font-medium">8. 安全管理措置</h4>
        <p>
          本サービスは、AWSが提供する認証基盤（Amazon Cognito）によるアクセス制御、
          通信・保管データの暗号化など、合理的な技術的安全管理措置を講じます。
        </p>
      </section>

      <section>
        <h4 className="font-medium">9. 開示・訂正・削除等の請求</h4>
        <p>
          利用者は、設定画面からご自身のデータ（メールアドレス・家計簿データ）をいつでも確認・訂正・削除
          できます。その他の請求については、お問い合わせ窓口までご連絡ください。
        </p>
      </section>

      <section>
        <h4 className="font-medium">10. 改定</h4>
        <p>
          本ポリシーは必要に応じて改定されることがあります。内容を実質的に変更した場合、
          利用規約と同様に次回ログイン時に変更後の内容への同意を求めます。
        </p>
      </section>

      <section>
        <h4 className="font-medium">11. お問い合わせ窓口</h4>
        <p>本ポリシーに関するお問い合わせは、運営者までご連絡ください。</p>
      </section>

      <p className="text-xs text-muted-foreground">最終改定日: {CURRENT_TERMS_VERSION}</p>
    </div>
  );
}

export function LegalContent() {
  return (
    <div className="space-y-6">
      <TermsOfServiceContent />
      <hr className="border-border" />
      <PrivacyPolicyContent />
    </div>
  );
}
