import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  CheckIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowRightIcon,
  PlayIcon,
  ChevronRightIcon,
  StarIcon,
  CircleStackIcon,
  CpuChipIcon,
  BoltIcon,
  BeakerIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

export const meta: MetaFunction = () => {
  return [
    { title: "Odeun - Transform Data Into Visual Stories" },
    { name: "description", content: "The future of data storytelling. Bring your spreadsheets to life with AI-powered visual narratives and real-time analytics." },
  ];
};

// Animation hook for scroll effects
function useScrollAnimation() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);
}

export default function LandingPage() {
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useScrollAnimation();

  // Handle scroll effect for header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const testimonials = [
    {
      quote: "Our data finally tells a story. Presentations went from hours to minutes.",
      author: "Sarah Chen",
      role: "Head of Analytics",
      company: "TechFlow",
      avatar: "SC"
    },
    {
      quote: "It's like having a data scientist and designer working 24/7 on our dashboards.",
      author: "Michael Torres",
      role: "Data Lead",
      company: "Nexus Analytics",
      avatar: "MT"
    },
    {
      quote: "Transformed how we communicate insights. Our exec team actually reads reports now.",
      author: "Emily Rodriguez",
      role: "VP Product",
      company: "Innovate Labs",
      avatar: "ER"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-slate-900 to-gray-950 text-white">
      {/* Holographic grid background effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-gray-950/90 backdrop-blur-xl border-b border-cyan-500/10 shadow-lg shadow-cyan-500/5'
          : 'bg-transparent'
      }`}>
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-3">
                <div className="relative w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  <SparklesIcon className="h-6 w-6 text-white" />
                  <div className="absolute inset-0 bg-cyan-400/20 rounded-lg blur animate-pulse"></div>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Odeun
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link to="/product" className="text-gray-300 hover:text-cyan-400 font-medium transition-colors">
                Product
              </Link>
              <Link to="/solutions" className="text-gray-300 hover:text-cyan-400 font-medium transition-colors">
                Solutions
              </Link>
              <Link to="/pricing" className="text-gray-300 hover:text-cyan-400 font-medium transition-colors">
                Pricing
              </Link>
              <Link to="/docs" className="text-gray-300 hover:text-cyan-400 font-medium transition-colors">
                Docs
              </Link>
            </div>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center space-x-4">
              <Link
                to="/auth/signin"
                className="text-gray-300 hover:text-cyan-400 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth/signup"
                className="relative inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg overflow-hidden group hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300"
              >
                <span className="relative z-10">Start for free</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-300 hover:bg-gray-800/50 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-800">
              <div className="space-y-2">
                <Link
                  to="/product"
                  className="block px-3 py-2 text-gray-300 hover:bg-gray-800/50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Product
                </Link>
                <Link
                  to="/solutions"
                  className="block px-3 py-2 text-gray-300 hover:bg-gray-800/50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Solutions
                </Link>
                <Link
                  to="/pricing"
                  className="block px-3 py-2 text-gray-300 hover:bg-gray-800/50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  to="/docs"
                  className="block px-3 py-2 text-gray-300 hover:bg-gray-800/50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Docs
                </Link>
                <div className="pt-4 space-y-2 border-t border-gray-800">
                  <Link
                    to="/auth/signin"
                    className="block px-3 py-2 text-gray-300 hover:bg-gray-800/50 rounded-lg font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/auth/signup"
                    className="block px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-center font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Start for free
                  </Link>
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 lg:pt-40 pb-32">
        {/* Animated light trails */}
        <div className="absolute top-0 left-1/4 w-1 h-full bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent animate-pulse"></div>
        <div className="absolute top-0 right-1/3 w-1 h-full bg-gradient-to-b from-transparent via-blue-500/30 to-transparent animate-pulse" style={{animationDelay: '1s'}}></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
            {/* Left: Text Content */}
            <div className="text-left">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium mb-8 backdrop-blur-sm">
                <BoltIcon className="h-4 w-4 mr-2" />
                The Future of Data Storytelling
              </div>

              <h1 className="text-6xl lg:text-7xl xl:text-8xl font-black mb-8 leading-[1.1]">
                <span className="block text-white">Transform</span>
                <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Data Into
                </span>
                <span className="block text-white">Visual Stories</span>
              </h1>

              <p className="text-xl text-gray-400 mb-12 max-w-xl leading-relaxed">
                Bring your spreadsheets to life. AI-powered narratives that transform raw data into compelling visual stories your team actually wants to read.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  to="/auth/signup"
                  className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-lg font-bold rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105"
                >
                  <span className="relative z-10 flex items-center">
                    Start for free
                    <ArrowRightIcon className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center px-8 py-4 bg-white/5 text-white text-lg font-semibold rounded-xl hover:bg-white/10 border border-gray-700 backdrop-blur-sm transition-all duration-300"
                >
                  <PlayIcon className="mr-2 h-5 w-5" />
                  Watch Demo
                </Link>
              </div>

              {/* Tech Specs */}
              <div className="flex flex-wrap gap-6 text-sm text-gray-400">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mr-2 animate-pulse"></div>
                  Real-time Analytics
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                  AI-Powered Insights
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-violet-500 rounded-full mr-2 animate-pulse"></div>
                  Zero Code Required
                </div>
              </div>
            </div>

            {/* Right: Futuristic Data Visualization */}
            <div className="relative">
              {/* Holographic data display mockup */}
              <div className="relative rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl shadow-cyan-500/20 bg-gradient-to-br from-gray-900 to-slate-950">
                {/* Neon frame */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-blue-500/20 pointer-events-none"></div>

                {/* Floating UI window */}
                <div className="p-8 space-y-6">
                  {/* Header bar */}
                  <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-pink-600 shadow-lg shadow-pink-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 shadow-lg shadow-cyan-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/50"></div>
                    </div>
                    <div className="text-xs text-cyan-400 font-mono">LIVE_DATA_STREAM</div>
                  </div>

                  {/* Data visualization mockup */}
                  <div className="space-y-4">
                    {/* Chart bars */}
                    <div className="flex items-end justify-between h-40 gap-3">
                      {[65, 82, 58, 91, 73, 88, 69, 94].map((height, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end">
                          <div
                            className="w-full bg-gradient-to-t from-cyan-500 via-blue-500 to-violet-500 rounded-t-lg shadow-lg shadow-cyan-500/30 relative overflow-hidden"
                            style={{height: `${height}%`}}
                          >
                            <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Data cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-sm">
                        <div className="text-xs text-cyan-400 mb-1 font-mono">REVENUE</div>
                        <div className="text-2xl font-bold text-white">$2.4M</div>
                        <div className="text-xs text-green-400 flex items-center mt-1">
                          <span className="mr-1">↗</span> +23.4%
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-violet-500/10 border border-violet-500/30 backdrop-blur-sm">
                        <div className="text-xs text-violet-400 mb-1 font-mono">USERS</div>
                        <div className="text-2xl font-bold text-white">18.2K</div>
                        <div className="text-xs text-green-400 flex items-center mt-1">
                          <span className="mr-1">↗</span> +12.8%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Glowing accent line */}
                  <div className="h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
                </div>
              </div>

              {/* Floating geometric shapes */}
              <div className="absolute -top-8 -right-8 w-24 h-24 border border-cyan-500/30 rounded-lg rotate-12 animate-pulse"></div>
              <div className="absolute -bottom-8 -left-8 w-32 h-32 border border-blue-500/30 rounded-lg -rotate-12 animate-pulse" style={{animationDelay: '1s'}}></div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-24 text-center">
            <p className="text-sm text-gray-500 mb-8 uppercase tracking-wider">Trusted by Data Teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-40">
              {['TechFlow', 'DataCorp', 'Nexus', 'InnovateLabs', 'CloudBase'].map((company) => (
                <div key={company} className="text-gray-400 font-bold text-xl tracking-wider">
                  {company}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Steps - INITIATE / REFINE / DEPLOY */}
      <section className="py-32 relative overflow-hidden animate-on-scroll opacity-0">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-white mb-6">
                Data → Story in <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Three Steps</span>
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Streamlined workflow that turns complex datasets into compelling visual narratives
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  title: "INITIATE",
                  description: "Upload your data or connect to live sources. Our AI instantly maps relationships and identifies key insights.",
                  icon: CircleStackIcon,
                  color: "cyan"
                },
                {
                  step: "02",
                  title: "REFINE",
                  description: "AI generates visual stories with charts, narratives, and interactive elements. Customize every detail or let AI optimize.",
                  icon: CpuChipIcon,
                  color: "blue"
                },
                {
                  step: "03",
                  title: "DEPLOY",
                  description: "Share live dashboards, export presentations, or embed anywhere. Your story updates in real-time as data changes.",
                  icon: RocketLaunchIcon,
                  color: "violet"
                }
              ].map((workflow, index) => (
                <div
                  key={index}
                  className="group relative bg-gradient-to-br from-gray-900 to-slate-950 rounded-2xl p-8 border border-gray-800 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/10"
                >
                  {/* Neon glow on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br from-${workflow.color}-500/0 to-${workflow.color}-500/0 group-hover:from-${workflow.color}-500/5 group-hover:to-transparent rounded-2xl transition-all duration-300`}></div>

                  <div className="relative z-10">
                    {/* Step number */}
                    <div className="text-6xl font-black text-gray-800 mb-4">{workflow.step}</div>

                    {/* Icon */}
                    <div className={`inline-flex p-4 rounded-xl bg-${workflow.color}-500/10 border border-${workflow.color}-500/30 mb-6`}>
                      <workflow.icon className={`h-8 w-8 text-${workflow.color}-400`} />
                    </div>

                    {/* Title */}
                    <h3 className={`text-2xl font-black text-${workflow.color}-400 mb-4 tracking-wider`}>
                      {workflow.title}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-400 leading-relaxed">
                      {workflow.description}
                    </p>
                  </div>

                  {/* Geometric accent */}
                  <div className={`absolute top-4 right-4 w-16 h-16 border border-${workflow.color}-500/20 rounded-lg rotate-12 group-hover:rotate-45 transition-transform duration-300`}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Product Features Grid */}
      <section className="py-32 relative overflow-hidden bg-gradient-to-b from-transparent via-slate-950/50 to-transparent animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-white mb-6">
                Built for <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Data Storytellers</span>
              </h2>
              <p className="text-xl text-gray-400">
                Enterprise-grade features wrapped in a beautiful, intuitive interface
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Real-Time Data Sync",
                  description: "Connect to any data source. Your stories update automatically as data changes.",
                  icon: BoltIcon,
                  gradient: "from-cyan-500 to-blue-600"
                },
                {
                  title: "AI-Powered Narratives",
                  description: "AI generates compelling text that explains your data insights in plain language.",
                  icon: SparklesIcon,
                  gradient: "from-blue-500 to-violet-600"
                },
                {
                  title: "Interactive Visualizations",
                  description: "Dynamic charts and graphs that respond to user interaction. No coding required.",
                  icon: ChartBarIcon,
                  gradient: "from-violet-500 to-pink-600"
                },
                {
                  title: "Collaborative Workspace",
                  description: "Team editing, comments, version history. Built for modern data teams.",
                  icon: BeakerIcon,
                  gradient: "from-pink-500 to-cyan-600"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="group relative bg-gradient-to-br from-gray-900 to-slate-950 rounded-2xl overflow-hidden border border-gray-800 hover:border-cyan-500/30 transition-all duration-300"
                >
                  {/* Neon top border */}
                  <div className={`h-1 bg-gradient-to-r ${feature.gradient}`}></div>

                  <div className="p-8">
                    {/* Icon */}
                    <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${feature.gradient} bg-opacity-10 mb-6 shadow-lg`}>
                      <feature.icon className="h-7 w-7 text-white" />
                    </div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Hover effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-blue-500/0 group-hover:from-cyan-500/5 group-hover:to-blue-500/5 pointer-events-none transition-all duration-300"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof - Testimonials */}
      <section className="py-32 relative overflow-hidden animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-white mb-6">
                Loved by <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Data Teams</span>
              </h2>
            </div>

            {/* Testimonial Carousel */}
            <div className="relative max-w-4xl mx-auto">
              <div className="relative bg-gradient-to-br from-gray-900 to-slate-950 rounded-2xl p-12 border border-cyan-500/20 shadow-2xl shadow-cyan-500/10">
                {/* Neon accent corners */}
                <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-cyan-500/50 rounded-tl-2xl"></div>
                <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-blue-500/50 rounded-br-2xl"></div>

                {/* Stars */}
                <div className="flex items-center justify-center mb-8">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="h-6 w-6 text-cyan-400 fill-current" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-center relative z-10">
                  <p className="text-2xl md:text-3xl font-medium text-white mb-8 leading-relaxed">
                    "{testimonials[currentTestimonial].quote}"
                  </p>
                  <footer className="flex items-center justify-center space-x-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-cyan-500/50">
                      {testimonials[currentTestimonial].avatar}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white text-lg">
                        {testimonials[currentTestimonial].author}
                      </div>
                      <div className="text-sm text-gray-400">
                        {testimonials[currentTestimonial].role} • {testimonials[currentTestimonial].company}
                      </div>
                    </div>
                  </footer>
                </blockquote>

                {/* Carousel Indicators */}
                <div className="flex justify-center space-x-3 mt-10">
                  {testimonials.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentTestimonial(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === currentTestimonial
                          ? 'w-12 bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/50'
                          : 'w-2 bg-gray-600 hover:bg-gray-500'
                      }`}
                      aria-label={`Go to testimonial ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Trust */}
      <section className="py-32 relative overflow-hidden bg-gradient-to-b from-transparent via-blue-950/10 to-transparent animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Security Badge */}
              <div className="relative">
                <div className="relative bg-gradient-to-br from-cyan-500/10 to-blue-600/10 rounded-2xl p-12 border border-cyan-500/30 backdrop-blur-sm">
                  <ShieldCheckIcon className="h-24 w-24 text-cyan-400 mb-6 mx-auto" />
                  <h3 className="text-3xl font-black text-white mb-4 text-center">
                    Enterprise Security
                  </h3>
                  <p className="text-gray-400 text-center mb-8">
                    Bank-level encryption, SOC2 compliance, and complete data sovereignty
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {['SOC2', 'GDPR', 'HIPAA', 'ISO 27001'].map((cert) => (
                      <span
                        key={cert}
                        className="px-4 py-2 bg-gray-900 border border-cyan-500/30 text-cyan-400 text-sm rounded-lg font-mono"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Geometric accent */}
                <div className="absolute -bottom-6 -right-6 w-32 h-32 border-2 border-cyan-500/20 rounded-2xl rotate-12"></div>
              </div>

              {/* Right: Feature List */}
              <div className="space-y-6">
                {[
                  {
                    title: "End-to-End Encryption",
                    description: "Your data is encrypted in transit and at rest with AES-256"
                  },
                  {
                    title: "Role-Based Access",
                    description: "Granular permissions and access controls for every team member"
                  },
                  {
                    title: "Audit Trail",
                    description: "Complete visibility into who accessed what and when"
                  },
                  {
                    title: "Private Cloud Options",
                    description: "Deploy on your infrastructure for maximum control"
                  },
                  {
                    title: "99.99% Uptime SLA",
                    description: "Enterprise reliability with redundant infrastructure"
                  }
                ].map((item, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center border border-cyan-500/50">
                        <CheckIcon className="h-4 w-4 text-cyan-400" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg mb-1">
                        {item.title}
                      </h3>
                      <p className="text-gray-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative overflow-hidden animate-on-scroll opacity-0">
        {/* Dramatic gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 via-blue-600/20 to-violet-600/20"></div>
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight">
              Ready to Transform
              <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                Your Data Story?
              </span>
            </h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Join thousands of data teams creating visual stories that drive decisions
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                to="/auth/signup"
                className="group relative inline-flex items-center justify-center px-10 py-5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xl font-black rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105"
              >
                <span className="relative z-10 flex items-center">
                  Start for free
                  <ArrowRightIcon className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center px-10 py-5 bg-white/5 text-white text-xl font-bold rounded-xl hover:bg-white/10 border-2 border-white/20 backdrop-blur-sm transition-all duration-300"
              >
                Book a demo
              </Link>
            </div>

            <p className="text-sm text-gray-500">
              No credit card required • Free 14-day trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-gray-800 bg-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-bold text-white mb-4">Product</h3>
              <ul className="space-y-3">
                <li><Link to="/features" className="text-gray-400 hover:text-cyan-400 transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="text-gray-400 hover:text-cyan-400 transition-colors">Pricing</Link></li>
                <li><Link to="/integrations" className="text-gray-400 hover:text-cyan-400 transition-colors">Integrations</Link></li>
                <li><Link to="/api" className="text-gray-400 hover:text-cyan-400 transition-colors">API</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link to="/about" className="text-gray-400 hover:text-cyan-400 transition-colors">About</Link></li>
                <li><Link to="/careers" className="text-gray-400 hover:text-cyan-400 transition-colors">Careers</Link></li>
                <li><Link to="/blog" className="text-gray-400 hover:text-cyan-400 transition-colors">Blog</Link></li>
                <li><Link to="/press" className="text-gray-400 hover:text-cyan-400 transition-colors">Press</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-4">Resources</h3>
              <ul className="space-y-3">
                <li><Link to="/docs" className="text-gray-400 hover:text-cyan-400 transition-colors">Documentation</Link></li>
                <li><Link to="/tutorials" className="text-gray-400 hover:text-cyan-400 transition-colors">Tutorials</Link></li>
                <li><Link to="/templates" className="text-gray-400 hover:text-cyan-400 transition-colors">Templates</Link></li>
                <li><Link to="/support" className="text-gray-400 hover:text-cyan-400 transition-colors">Support</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-4">Legal</h3>
              <ul className="space-y-3">
                <li><Link to="/privacy" className="text-gray-400 hover:text-cyan-400 transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="text-gray-400 hover:text-cyan-400 transition-colors">Terms</Link></li>
                <li><Link to="/security" className="text-gray-400 hover:text-cyan-400 transition-colors">Security</Link></li>
                <li><Link to="/compliance" className="text-gray-400 hover:text-cyan-400 transition-colors">Compliance</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0 flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50">
                <SparklesIcon className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm text-gray-400">© 2025 Odeun. All rights reserved.</span>
            </div>

            <div className="flex space-x-6">
              <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors" aria-label="Twitter">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors" aria-label="LinkedIn">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors" aria-label="GitHub">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-on-scroll {
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        .animate-on-scroll.animate-in {
          animation: fadeInUp 1s ease forwards;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}} />
    </div>
  );
}
