import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  CheckIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowRightIcon,
  PlayIcon,
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
    <div className="min-h-screen bg-white">
      {/* Subtle holographic grid overlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.03] z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px'
        }}></div>
      </div>

      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-cyan-100'
          : 'bg-white'
      }`}>
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
                  <SparklesIcon className="h-6 w-6 text-white" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  Odeun
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link to="/product" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Product
              </Link>
              <Link to="/solutions" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Solutions
              </Link>
              <Link to="/pricing" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Pricing
              </Link>
              <Link to="/docs" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Docs
              </Link>
            </div>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center space-x-4">
              <Link
                to="/auth/signin"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/auth/signup"
                className="relative px-6 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 hover:scale-105 overflow-hidden group"
              >
                <span className="relative z-10">Start for free</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
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
            <div className="lg:hidden py-4 border-t border-gray-100">
              <div className="space-y-2">
                <Link
                  to="/product"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Product
                </Link>
                <Link
                  to="/solutions"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Solutions
                </Link>
                <Link
                  to="/pricing"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  to="/docs"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Docs
                </Link>
                <div className="pt-4 space-y-2 border-t border-gray-100">
                  <Link
                    to="/auth/signin"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/auth/signup"
                    className="block px-3 py-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white text-center font-semibold rounded-lg hover:shadow-lg transition-all"
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

      {/* Hero Section - White background with colorful illustration */}
      <section className="relative overflow-hidden pt-32 lg:pt-40 pb-24 bg-white">
        {/* Animated gradient orbs */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-gradient-to-br from-cyan-200/30 to-blue-300/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-br from-violet-200/30 to-pink-200/30 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>

        {/* Geometric accent elements */}
        <div className="absolute top-40 left-10 w-20 h-20 border-2 border-cyan-400/20 rounded-lg rotate-12 animate-pulse"></div>
        <div className="absolute bottom-40 right-20 w-24 h-24 border-2 border-violet-400/20 rounded-lg -rotate-12 animate-pulse" style={{animationDelay: '0.5s'}}></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
            {/* Left: Text Content */}
            <div className="text-left">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-cyan-50 via-blue-50 to-violet-50 border-2 border-cyan-200/50 text-cyan-700 text-sm font-semibold mb-8 shadow-lg shadow-cyan-200/20">
                <BoltIcon className="h-4 w-4 mr-2 text-cyan-500" />
                AI-Powered Data Storytelling
              </div>

              <h1 className="text-6xl lg:text-7xl xl:text-8xl font-black mb-8 leading-[1.1] text-gray-900">
                <span className="block">Transform</span>
                <span className="block bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 bg-clip-text text-transparent animate-gradient">
                  Data Into
                </span>
                <span className="block">Visual Stories</span>
              </h1>

              <p className="text-xl text-gray-600 mb-12 max-w-xl leading-relaxed">
                Bring your spreadsheets to life. AI-powered narratives that transform raw data into compelling visual stories your team actually wants to read.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  to="/auth/signup"
                  className="group relative inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white text-lg font-black rounded-xl hover:shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center">
                    Start for free
                    <ArrowRightIcon className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  {/* Neon glow effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute inset-0 bg-cyan-400/20 blur-xl"></div>
                  </div>
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-50 border-2 border-gray-200 transition-all duration-300"
                >
                  <PlayIcon className="mr-2 h-5 w-5" />
                  Watch demo
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-6 text-sm text-gray-500">
                <div className="flex items-center">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  No credit card required
                </div>
                <div className="flex items-center">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  Free 14-day trial
                </div>
                <div className="flex items-center">
                  <CheckIcon className="h-4 w-4 text-green-500 mr-2" />
                  Cancel anytime
                </div>
              </div>
            </div>

            {/* Right: Data Visualization Mockup */}
            <div className="relative">
              {/* Main card with neon gradient border */}
              <div className="relative bg-white rounded-3xl shadow-2xl shadow-cyan-500/30 overflow-hidden border-2 border-cyan-200/50 hover:border-cyan-300/70 transition-all duration-300 group">
                {/* Neon gradient accent bar */}
                <div className="h-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                </div>

                {/* Card content */}
                <div className="p-8 space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-cyan-100/50">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-400 to-pink-500 shadow-lg shadow-pink-500/50 animate-pulse"></div>
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500 shadow-lg shadow-cyan-500/50 animate-pulse" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 to-green-500 shadow-lg shadow-green-500/50 animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                    <div className="text-xs text-cyan-700 font-mono bg-gradient-to-r from-cyan-50 to-blue-50 px-3 py-1 rounded-full border border-cyan-200/50 font-semibold">
                      LIVE_DATA_STREAM
                    </div>
                  </div>

                  {/* Animated chart bars */}
                  <div className="space-y-4">
                    <div className="flex items-end justify-between h-48 gap-3">
                      {[65, 82, 58, 91, 73, 88, 69, 94].map((height, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end">
                          <div
                            className="w-full bg-gradient-to-t from-cyan-400 via-blue-500 to-violet-500 rounded-t-xl relative overflow-hidden shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-300"
                            style={{height: `${height}%`}}
                          >
                            <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent"></div>
                            {/* Shimmer effect */}
                            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity"></div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Data cards with neon accents */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-50 via-blue-50 to-violet-50 border-2 border-cyan-200/50 hover:border-cyan-300/70 transition-all duration-300 shadow-lg shadow-cyan-200/30 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/0 to-cyan-100/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                          <div className="text-xs text-cyan-700 font-bold mb-1 font-mono">REVENUE</div>
                          <div className="text-3xl font-black bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">$2.4M</div>
                          <div className="text-xs text-green-600 flex items-center mt-1 font-bold">
                            ↗ +23.4%
                          </div>
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 via-purple-50 to-pink-50 border-2 border-violet-200/50 hover:border-violet-300/70 transition-all duration-300 shadow-lg shadow-violet-200/30 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-100/0 to-violet-100/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                          <div className="text-xs text-violet-700 font-bold mb-1 font-mono">USERS</div>
                          <div className="text-3xl font-black bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">18.2K</div>
                          <div className="text-xs text-green-600 flex items-center mt-1 font-bold">
                            ↗ +12.8%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating accent elements - more cyberpunk */}
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-gradient-to-br from-pink-300 to-violet-300 rounded-full blur-3xl opacity-60 animate-pulse"></div>
              <div className="absolute -bottom-6 -left-6 w-40 h-40 bg-gradient-to-br from-cyan-300 to-blue-300 rounded-full blur-3xl opacity-60 animate-pulse" style={{animationDelay: '1s'}}></div>

              {/* Geometric accent shapes */}
              <div className="absolute -top-4 -left-4 w-16 h-16 border-2 border-cyan-400/30 rounded-lg rotate-12"></div>
              <div className="absolute -bottom-4 -right-4 w-20 h-20 border-2 border-violet-400/30 rounded-lg -rotate-12"></div>
            </div>
          </div>

          {/* Trust logos */}
          <div className="mt-24 text-center">
            <p className="text-sm text-gray-500 mb-8 uppercase tracking-wider font-semibold">Trusted by data teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-40">
              {['TechFlow', 'DataCorp', 'Nexus', 'InnovateLabs', 'CloudBase'].map((company) => (
                <div key={company} className="text-gray-800 font-bold text-xl">
                  {company}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section - INITIATE / REFINE / DEPLOY - White background */}
      <section className="py-24 bg-white animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-gray-900 mb-6">
                Data → Story in{' '}
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  Three Steps
                </span>
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
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
                  gradient: "from-blue-500 to-cyan-500"
                },
                {
                  step: "02",
                  title: "REFINE",
                  description: "AI generates visual stories with charts, narratives, and interactive elements. Customize every detail or let AI optimize.",
                  icon: CpuChipIcon,
                  gradient: "from-violet-500 to-purple-500"
                },
                {
                  step: "03",
                  title: "DEPLOY",
                  description: "Share live dashboards, export presentations, or embed anywhere. Your story updates in real-time as data changes.",
                  icon: RocketLaunchIcon,
                  gradient: "from-pink-500 to-rose-500"
                }
              ].map((workflow, index) => (
                <div
                  key={index}
                  className="group relative bg-white rounded-3xl p-8 border-2 border-gray-100 hover:border-blue-200 transition-all duration-300 hover:shadow-xl hover:shadow-blue-100"
                >
                  <div className="relative z-10">
                    {/* Step number */}
                    <div className="text-7xl font-black text-gray-100 mb-4">{workflow.step}</div>

                    {/* Icon */}
                    <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${workflow.gradient} mb-6 shadow-lg shadow-blue-200/50`}>
                      <workflow.icon className="h-8 w-8 text-white" />
                    </div>

                    {/* Title */}
                    <h3 className="text-2xl font-black text-gray-900 mb-4 tracking-wide">
                      {workflow.title}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-600 leading-relaxed">
                      {workflow.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid - Light gradient background for variety */}
      <section className="py-24 bg-gradient-to-b from-blue-50 via-violet-50 to-pink-50 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-gray-900 mb-6">
                Built for{' '}
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  Data Storytellers
                </span>
              </h2>
              <p className="text-xl text-gray-600">
                Enterprise-grade features wrapped in a beautiful, intuitive interface
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Real-Time Data Sync",
                  description: "Connect to any data source. Your stories update automatically as data changes.",
                  icon: BoltIcon,
                  gradient: "from-blue-500 to-cyan-500"
                },
                {
                  title: "AI-Powered Narratives",
                  description: "AI generates compelling text that explains your data insights in plain language.",
                  icon: SparklesIcon,
                  gradient: "from-violet-500 to-purple-500"
                },
                {
                  title: "Interactive Visualizations",
                  description: "Dynamic charts and graphs that respond to user interaction. No coding required.",
                  icon: ChartBarIcon,
                  gradient: "from-pink-500 to-rose-500"
                },
                {
                  title: "Collaborative Workspace",
                  description: "Team editing, comments, version history. Built for modern data teams.",
                  icon: BeakerIcon,
                  gradient: "from-cyan-500 to-blue-500"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="group relative bg-white rounded-3xl overflow-hidden border-2 border-gray-100 hover:border-blue-200 transition-all duration-300 hover:shadow-xl"
                >
                  {/* Gradient accent */}
                  <div className={`h-2 bg-gradient-to-r ${feature.gradient}`}></div>

                  <div className="p-8">
                    {/* Icon */}
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} mb-6 shadow-lg`}>
                      <feature.icon className="h-7 w-7 text-white" />
                    </div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials - White background */}
      <section className="py-24 bg-white animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-5xl font-black text-gray-900 mb-6">
                Loved by{' '}
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  Data Teams
                </span>
              </h2>
            </div>

            {/* Testimonial Carousel */}
            <div className="relative max-w-4xl mx-auto">
              <div className="relative bg-gradient-to-br from-blue-50 to-violet-50 rounded-3xl p-12 border-2 border-blue-100">
                {/* Stars */}
                <div className="flex items-center justify-center mb-8">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="h-6 w-6 text-yellow-400 fill-current" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-center relative z-10">
                  <p className="text-2xl md:text-3xl font-semibold text-gray-900 mb-8 leading-relaxed">
                    "{testimonials[currentTestimonial].quote}"
                  </p>
                  <footer className="flex items-center justify-center space-x-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                      {testimonials[currentTestimonial].avatar}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-gray-900 text-lg">
                        {testimonials[currentTestimonial].author}
                      </div>
                      <div className="text-sm text-gray-600">
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
                          ? 'w-12 bg-gradient-to-r from-blue-600 to-violet-600'
                          : 'w-2 bg-gray-300 hover:bg-gray-400'
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

      {/* Security Section - White background */}
      <section className="py-24 bg-white animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Security Badge */}
              <div className="relative">
                <div className="relative bg-gradient-to-br from-blue-50 to-violet-50 rounded-3xl p-12 border-2 border-blue-100">
                  <ShieldCheckIcon className="h-24 w-24 text-blue-600 mb-6 mx-auto" />
                  <h3 className="text-3xl font-black text-gray-900 mb-4 text-center">
                    Enterprise Security
                  </h3>
                  <p className="text-gray-600 text-center mb-8">
                    Bank-level encryption, SOC2 compliance, and complete data sovereignty
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {['SOC2', 'GDPR', 'HIPAA', 'ISO 27001'].map((cert) => (
                      <span
                        key={cert}
                        className="px-4 py-2 bg-white border-2 border-blue-100 text-blue-700 text-sm rounded-xl font-bold"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
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
                      <div className="w-6 h-6 bg-green-50 rounded-full flex items-center justify-center border-2 border-green-200">
                        <CheckIcon className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg mb-1">
                        {item.title}
                      </h3>
                      <p className="text-gray-600">
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

      {/* Final CTA - Gradient background like Image #3 */}
      <section className="py-32 relative overflow-hidden bg-gradient-to-br from-blue-600 via-violet-600 to-pink-600 animate-on-scroll opacity-0">
        {/* Decorative gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-pink-400 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl opacity-30"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight">
              Ready to Transform Your Data Story?
            </h2>
            <p className="text-xl text-white/90 mb-12 max-w-2xl mx-auto">
              Join thousands of data teams creating visual stories that drive decisions
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                to="/auth/signup"
                className="group inline-flex items-center justify-center px-10 py-5 bg-white text-blue-600 text-xl font-black rounded-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
              >
                <span className="flex items-center">
                  Start for free
                  <ArrowRightIcon className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center px-10 py-5 bg-white/10 text-white text-xl font-bold rounded-xl hover:bg-white/20 border-2 border-white/30 backdrop-blur-sm transition-all duration-300"
              >
                Book a demo
              </Link>
            </div>

            <p className="text-sm text-white/80">
              No credit card required • Free 14-day trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer - White background */}
      <footer className="bg-white border-t border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-bold text-gray-900 mb-4">Product</h3>
              <ul className="space-y-3">
                <li><Link to="/features" className="text-gray-600 hover:text-blue-600 transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="text-gray-600 hover:text-blue-600 transition-colors">Pricing</Link></li>
                <li><Link to="/integrations" className="text-gray-600 hover:text-blue-600 transition-colors">Integrations</Link></li>
                <li><Link to="/api" className="text-gray-600 hover:text-blue-600 transition-colors">API</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link to="/about" className="text-gray-600 hover:text-blue-600 transition-colors">About</Link></li>
                <li><Link to="/careers" className="text-gray-600 hover:text-blue-600 transition-colors">Careers</Link></li>
                <li><Link to="/blog" className="text-gray-600 hover:text-blue-600 transition-colors">Blog</Link></li>
                <li><Link to="/press" className="text-gray-600 hover:text-blue-600 transition-colors">Press</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-4">Resources</h3>
              <ul className="space-y-3">
                <li><Link to="/docs" className="text-gray-600 hover:text-blue-600 transition-colors">Documentation</Link></li>
                <li><Link to="/tutorials" className="text-gray-600 hover:text-blue-600 transition-colors">Tutorials</Link></li>
                <li><Link to="/templates" className="text-gray-600 hover:text-blue-600 transition-colors">Templates</Link></li>
                <li><Link to="/support" className="text-gray-600 hover:text-blue-600 transition-colors">Support</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-4">Legal</h3>
              <ul className="space-y-3">
                <li><Link to="/privacy" className="text-gray-600 hover:text-blue-600 transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="text-gray-600 hover:text-blue-600 transition-colors">Terms</Link></li>
                <li><Link to="/security" className="text-gray-600 hover:text-blue-600 transition-colors">Security</Link></li>
                <li><Link to="/compliance" className="text-gray-600 hover:text-blue-600 transition-colors">Compliance</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0 flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center">
                <SparklesIcon className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm text-gray-600">© 2025 Odeun. All rights reserved.</span>
            </div>

            <div className="flex space-x-6">
              <a href="#" className="text-gray-400 hover:text-blue-600 transition-colors" aria-label="Twitter">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-600 transition-colors" aria-label="LinkedIn">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-600 transition-colors" aria-label="GitHub">
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

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes gradient {
          0%, 100% {
            background-size: 200% 200%;
            background-position: left center;
          }
          50% {
            background-size: 200% 200%;
            background-position: right center;
          }
        }

        .animate-on-scroll {
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        .animate-on-scroll.animate-in {
          animation: fadeInUp 1s ease forwards;
        }

        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }

        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}} />
    </div>
  );
}
