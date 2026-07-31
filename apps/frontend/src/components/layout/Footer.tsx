import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
      <p>
        © 2026 minato project.{' '}
        <Link to="/terms" className="text-primary underline-offset-4 hover:underline">
          利用規約・プライバシーポリシー
        </Link>
      </p>
    </footer>
  );
}
