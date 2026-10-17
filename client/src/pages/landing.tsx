import { Button } from "@/components/ui/button";
import {
  Camera,
  CheckCircle,
  Download,
  ArrowRight,
  MessageCircle,
  Mail,
  Star,
} from "lucide-react";
const beforePaper = "https://erwgondjnbxczxpkemml.supabase.co/storage/v1/object/public/paprrr-images/assets/before-paper.png";
const afterPaper = "https://erwgondjnbxczxpkemml.supabase.co/storage/v1/object/public/paprrr-images/assets/after-paper.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-sans">

      {/* ── Nav ── */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <span className="font-bold text-xl tracking-tight select-none">
            Test<span className="text-primary">Made</span>Easy
          </span>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <Button
            data-testid="button-login"
            onClick={() => window.location.href = "/login"}
            className="shrink-0"
          >
            Try for Free
          </Button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Text */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary mb-6 font-medium">
              ✓ 100% Free — no credit card needed
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Still typing your<br />
              <span className="text-primary">question paper</span><br />
              by hand?
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-3">
              Just upload a photo of your questions. We'll turn it into a clean,
              print-ready paper in minutes.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Works for <strong className="text-foreground">CBSE · ICSE · State Board</strong>
              &nbsp;|&nbsp; Maths · Science · English · Hindi & more
            </p>
            <Button
              data-testid="button-hero-start"
              size="lg"
              onClick={() => window.location.href = "/login"}
              className="gap-2 text-base px-8"
            >
              Try it Free — it takes 2 minutes
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-primary" /> No installation needed
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-primary" /> Works on mobile
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-primary" /> No sign-up hassle
              </span>
            </div>
          </div>

          {/* Before → After */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
            {/* Before */}
            <div className="flex flex-col items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground bg-muted px-3 py-1 rounded-full">
                Before
              </span>
              <div className="rounded-2xl overflow-hidden border shadow-md w-64 sm:w-72 aspect-[3/4] bg-muted">
                <img
                  src={beforePaper}
                  alt="Original question paper photo"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                A photo of your question sheet
              </p>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-primary rotate-90 sm:rotate-0" />
                </div>
              </div>
            </div>

            {/* After */}
            <div className="flex flex-col items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
                After
              </span>
              <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-md w-64 sm:w-72 aspect-[3/4] bg-muted">
                <img
                  src={afterPaper}
                  alt="Clean formatted test paper"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Clean, print-ready paper — in minutes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 bg-muted/30 border-y">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground">3 simple steps — no tech skills needed</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                Icon: Camera,
                title: "Take a Photo",
                desc: "Take a photo or upload an image of any question — handwritten, printed, or from a textbook.",
              },
              {
                step: "2",
                Icon: CheckCircle,
                title: "Pick Your Questions",
                desc: "Choose which questions to include. Arrange by topic, chapter, or difficulty — just like you'd want.",
              },
              {
                step: "3",
                Icon: Download,
                title: "Download & Print",
                desc: "Get a clean, professionally formatted paper ready to print and hand to your students.",
              },
            ].map(({ step, Icon, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {step}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Boards & Subjects strip ── */}
      <section className="py-10 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-muted-foreground mb-5">
            Works for all boards and subjects across India
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "CBSE", "ICSE", "State Board",
              "Maths", "Science", "English", "Hindi",
              "Social Studies", "Physics", "Chemistry",
              "Biology", "Sanskrit", "Computer Science",
            ].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full bg-muted text-sm text-foreground font-medium border"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Why Teachers Love It</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Built keeping Indian teachers in mind — simple, reliable, and free
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                emoji: "⏱️",
                title: "Save 2–3 hours every time",
                desc: "What used to take an entire evening now takes minutes. Spend that time with your students instead.",
              },
              {
                emoji: "🔒",
                title: "Your papers stay private",
                desc: "Your questions are stored securely and are only visible to you. Nobody else can see your content.",
              },
              {
                emoji: "📐",
                title: "Maths formulas work perfectly",
                desc: "Complex equations, diagrams, and formulas are captured accurately — no more manual retyping.",
              },
            ].map(({ emoji, title, desc }) => (
              <div
                key={title}
                className="text-center p-6 rounded-2xl bg-muted/30 border hover:border-primary/30 transition-colors"
              >
                <div className="text-4xl mb-4">{emoji}</div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 bg-muted/30 border-y">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">What Teachers Are Saying</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Sunita Sharma",
                role: "Maths Teacher, Delhi",
                quote:
                  "I used to spend 3 hours making one paper. Now it takes 15 minutes. I can't believe I didn't find this sooner.",
              },
              {
                name: "Ramesh Iyer",
                role: "Science Teacher, Chennai",
                quote:
                  "Even my handwritten notes get converted perfectly. The formatting is exactly what I need for my Class 10 students.",
              },
              {
                name: "Priya Nair",
                role: "English Teacher, Kochi",
                quote:
                  "My daughter helped me try it once and now I use it every week on my own. Bahut easy hai!",
              },
            ].map(({ name, role, quote }) => (
              <div key={name} className="bg-background rounded-2xl border p-6 flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground italic leading-relaxed flex-1">
                  "{quote}"
                </p>
                <div>
                  <p className="font-semibold text-sm">{name}</p>
                  <p className="text-xs text-muted-foreground">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Common Questions</h2>
          </div>
          <div className="space-y-4">
            {[
              {
                q: "Is it really free?",
                a: "Yes, completely free to use right now. No credit card, no hidden charges — just sign up and start.",
              },
              {
                q: "Do I need to install anything?",
                a: "No. It works directly in your browser on your phone or computer. Just open the website and start making papers.",
              },
              {
                q: "What if my questions have diagrams or maths formulas?",
                a: "It handles those too. Even complex equations and diagrams are captured and formatted correctly in your paper.",
              },
              {
                q: "Is my content safe?",
                a: "Yes. Your questions are private and only visible to you. We do not share your content with anyone.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl border bg-muted/20 p-5">
                <p className="font-semibold mb-2">{q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 bg-primary/5 border-y">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to save hours every week?
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Thousands of teachers across India are already making papers in minutes — not hours.
          </p>
          <Button
            size="lg"
            onClick={() => window.location.href = "/login"}
            className="gap-2 text-base px-8"
          >
            Try it Free Now
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            ✓ Free &nbsp;·&nbsp; ✓ No installation &nbsp;·&nbsp; ✓ Works on mobile
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <span className="font-bold text-lg">
                Test<span className="text-primary">Made</span>Easy
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Making exam papers easy for every teacher in India
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <a
                href="https://wa.me/917011271456"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-green-500" />
                WhatsApp: 7011271456
              </a>
              <a
                href="mailto:akash95agrawal@gmail.com"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Mail className="w-4 h-4" />
                akash95agrawal@gmail.com
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
