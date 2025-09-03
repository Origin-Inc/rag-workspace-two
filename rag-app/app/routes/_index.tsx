import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import { 
  CheckIcon, 
  ChartBarIcon, 
  DocumentTextIcon, 
  SparklesIcon,
  CloudArrowUpIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  ArrowRightIcon,
  PlayIcon,
  LockClosedIcon,
  CubeTransparentIcon,
  CommandLineIcon,
  ChevronRightIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { ChartBarIcon as ChartBarIconSolid } from "@heroicons/react/24/solid";

export const meta: MetaFunction = () => {
  return [
    { title: "Decisions Made Smarter. Workflows Done Faster." },
    { name: "description", content: "A collaborative AI workspace where your team transforms data, documents, and ideas into grounded decisions — not just tasks." },
  ];
};

// Animation hook for fade-in effect
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
      quote: "We replaced 5 tools with one — and our reports are twice as fast.",
      author: "Sarah Chen",
      role: "Head of Operations",
      company: "TechFlow",
      avatar: "SC"
    },
    {
      quote: "Finally, an AI that understands context. Every decision is traceable.",
      author: "Michael Torres",
      role: "Data Lead",
      company: "Nexus Analytics",
      avatar: "MT"
    },
    {
      quote: "Our team makes better decisions 3x faster. It's transformative.",
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
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-lg' 
          : 'bg-transparent'
      }`}>
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <SparklesIcon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  WorkspaceAI
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link to="/product" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                Product
              </Link>
              <Link to="/solutions" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                Solutions
              </Link>
              <Link to="/pricing" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                Pricing
              </Link>
              <Link to="/docs" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                Docs
              </Link>
              <Link to="/blog" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                Blog
              </Link>
            </div>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center space-x-4">
              <Link
                to="/auth/signin"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth/signup"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
            <div className="lg:hidden py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-2">
                <Link
                  to="/product"
                  className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Product
                </Link>
                <Link
                  to="/solutions"
                  className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Solutions
                </Link>
                <Link
                  to="/pricing"
                  className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  to="/docs"
                  className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Docs
                </Link>
                <Link
                  to="/blog"
                  className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Blog
                </Link>
                <div className="pt-4 space-y-2 border-t border-gray-200 dark:border-gray-700">
                  <Link
                    to="/auth/signin"
                    className="block px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/auth/signup"
                    className="block px-3 py-2 bg-blue-600 text-white text-center font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-32 lg:pt-40 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
              <SparklesIcon className="h-4 w-4 mr-2" />
              AI-Powered Workspace
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
              Decisions Made Smarter.
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                Workflows Done Faster.
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-2xl mx-auto">
              A collaborative AI workspace where your team transforms data, documents, and ideas into grounded decisions — not just tasks.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                to="/auth/signup"
                className="inline-flex items-center px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Start Free Trial
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center px-8 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-lg font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all duration-200"
              >
                <PlayIcon className="mr-2 h-5 w-5" />
                Book a Demo
              </Link>
            </div>
            
            {/* Animated Product Visual */}
            <div className="relative max-w-5xl mx-auto">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-1">
                <div className="bg-white dark:bg-gray-900 rounded-xl p-8">
                  <div className="space-y-4">
                    <div className="animate-pulse bg-gray-100 dark:bg-gray-800 h-4 w-3/4 rounded"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-blue-200 dark:border-blue-800">
                        <div className="flex items-center mb-2">
                          <ChartBarIconSolid className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dataset Block</span>
                        </div>
                        <div className="animate-pulse bg-blue-100 dark:bg-blue-900/30 h-20 rounded"></div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border-2 border-purple-200 dark:border-purple-800">
                        <div className="flex items-center mb-2">
                          <SparklesIcon className="h-5 w-5 text-purple-600 dark:text-purple-400 mr-2" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Block</span>
                        </div>
                        <div className="animate-pulse bg-purple-100 dark:bg-purple-900/30 h-20 rounded"></div>
                      </div>
                    </div>
                    <div className="animate-pulse bg-gray-100 dark:bg-gray-800 h-4 w-1/2 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Trust Logos */}
            <div className="mt-16">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Trusted by leading teams</p>
              <div className="flex flex-wrap justify-center items-center gap-8 opacity-50">
                {['TechFlow', 'DataCorp', 'Innovate', 'NextGen', 'CloudBase'].map((company) => (
                  <div key={company} className="text-gray-400 font-semibold text-lg">
                    {company}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Value Proposition */}
      <section className="py-24 bg-white dark:bg-gray-900 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Why tasks aren't enough.
              </h2>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="prose prose-lg dark:prose-invert">
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">Other tools think work = tasks.</span> They focus on checking boxes, managing lists, and tracking progress. But real work isn't about tasks — it's about making informed decisions.
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">We believe work = informed decisions.</span> Every meaningful outcome starts with understanding data, analyzing options, and choosing the right path forward.
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">Our AI-powered workspace turns decisions directly into completed tasks.</span> Upload data, get AI insights, make decisions, and watch as tasks complete themselves — all with full provenance and transparency.
                  </p>
                </div>
              </div>
              
              <div className="relative">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                        1
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Upload Dataset</p>
                        <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full w-full bg-blue-600 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">AI Analyzes & Suggests</p>
                        <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full w-3/4 bg-purple-600 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                        3
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Decision → Task Complete</p>
                        <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full w-1/2 bg-green-600 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Features */}
      <section className="py-24 bg-gray-50 dark:bg-gray-800 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                One page. Endless possibilities.
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Build dynamic workspaces with powerful, interconnected blocks
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: CubeTransparentIcon,
                  title: "Editable Blocks",
                  description: "Text, datasets, charts, and AI blocks that work together seamlessly.",
                  color: "blue"
                },
                {
                  icon: CloudArrowUpIcon,
                  title: "Upload & Connect",
                  description: "CSV uploads, Google Sheets snapshots, and API integrations.",
                  color: "green"
                },
                {
                  icon: SparklesIcon,
                  title: "Inline AI",
                  description: "Context-aware AI that understands your page and workspace.",
                  color: "purple"
                },
                {
                  icon: CommandLineIcon,
                  title: "Provenance & History",
                  description: "Every AI step traceable with references and version history.",
                  color: "indigo"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300"
                >
                  <div className={`inline-flex p-3 rounded-lg bg-${feature.color}-100 dark:bg-${feature.color}-900/30 mb-4`}>
                    <feature.icon className={`h-6 w-6 text-${feature.color}-600 dark:text-${feature.color}-400`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
            
            {/* Interactive Demo GIF Placeholder */}
            <div className="mt-16 bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-1">
                <div className="bg-white dark:bg-gray-900 rounded-t-xl">
                  <div className="flex items-center space-x-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                    <div className="flex-1 text-center text-sm text-gray-500 dark:text-gray-400">
                      workspace.ai/analytics-dashboard
                    </div>
                  </div>
                  <div className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                    <div className="text-center py-20">
                      <PlayIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">Interactive Demo</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof & Testimonials */}
      <section className="py-24 bg-white dark:bg-gray-900 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Built for teams who think before they act.
              </h2>
            </div>
            
            {/* Customer Logos */}
            <div className="flex flex-wrap justify-center items-center gap-12 mb-16 opacity-60">
              {['TechFlow', 'DataCorp', 'Innovate', 'NextGen', 'CloudBase', 'Analytics Pro', 'Future Tech', 'Smart Data'].map((company) => (
                <div key={company} className="text-gray-400 dark:text-gray-500 font-semibold text-xl">
                  {company}
                </div>
              ))}
            </div>
            
            {/* Testimonial Carousel */}
            <div className="relative max-w-4xl mx-auto">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl p-8 md:p-12">
                <div className="flex items-center justify-center mb-6">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="h-6 w-6 text-yellow-400 fill-current" />
                  ))}
                </div>
                
                <blockquote className="text-center">
                  <p className="text-xl md:text-2xl font-medium text-gray-900 dark:text-white mb-6">
                    "{testimonials[currentTestimonial].quote}"
                  </p>
                  <footer className="flex items-center justify-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold">
                      {testimonials[currentTestimonial].avatar}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {testimonials[currentTestimonial].author}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {testimonials[currentTestimonial].role} at {testimonials[currentTestimonial].company}
                      </div>
                    </div>
                  </footer>
                </blockquote>
                
                {/* Carousel Indicators */}
                <div className="flex justify-center space-x-2 mt-8">
                  {testimonials.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentTestimonial(index)}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        index === currentTestimonial
                          ? 'w-8 bg-blue-600 dark:bg-blue-400'
                          : 'bg-gray-300 dark:bg-gray-600'
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

      {/* Workflow Use Cases */}
      <section className="py-24 bg-gray-50 dark:bg-gray-800 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                From research to decisions — all in one workspace.
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Transform how your team works with intelligent workflows
              </p>
            </div>
            
            <div className="grid lg:grid-cols-3 gap-8">
              {[
                {
                  title: "Research & Analysis",
                  description: "AI-generated summaries, tables, and charts from your data",
                  features: ["Smart data extraction", "Automated insights", "Citation tracking"],
                  icon: DocumentTextIcon,
                  gradient: "from-blue-500 to-blue-600"
                },
                {
                  title: "Content & Reporting",
                  description: "Build reports with live datasets and dynamic narratives",
                  features: ["Real-time data sync", "Collaborative editing", "Export to any format"],
                  icon: ChartBarIcon,
                  gradient: "from-purple-500 to-purple-600"
                },
                {
                  title: "Team Decisions",
                  description: "Inline AI accelerates alignment and strategic choices",
                  features: ["Decision matrices", "Risk assessment", "Consensus tracking"],
                  icon: UserGroupIcon,
                  gradient: "from-green-500 to-green-600"
                }
              ].map((useCase, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
                >
                  <div className={`h-2 bg-gradient-to-r ${useCase.gradient}`}></div>
                  <div className="p-6">
                    <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${useCase.gradient} bg-opacity-10 mb-4`}>
                      <useCase.icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                      {useCase.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      {useCase.description}
                    </p>
                    <ul className="space-y-2">
                      {useCase.features.map((feature, i) => (
                        <li key={i} className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <CheckIcon className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="py-24 bg-white dark:bg-gray-900 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Enterprise-ready. Secure by design.
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Built with security and compliance at the core
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                {[
                  {
                    title: "Role-based access control",
                    description: "Viewer, Editor, and Admin roles with granular permissions"
                  },
                  {
                    title: "Complete audit trail",
                    description: "Provenance for every AI run with full traceability"
                  },
                  {
                    title: "SOC2 Type II compliant",
                    description: "Enterprise-grade security and compliance standards"
                  },
                  {
                    title: "Data encryption",
                    description: "End-to-end encryption at rest and in transit"
                  },
                  {
                    title: "Private cloud options",
                    description: "Deploy on your infrastructure for complete control"
                  }
                ].map((item, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {item.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="relative">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-1">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl p-8">
                    <ShieldCheckIcon className="h-16 w-16 text-blue-600 dark:text-blue-400 mb-4" />
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Security First
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      Your data never leaves your control. Full encryption, audit logs, and compliance built in.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['SOC2', 'GDPR', 'HIPAA', 'ISO 27001'].map((cert) => (
                        <span
                          key={cert}
                          className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-full"
                        >
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 animate-on-scroll opacity-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to make smarter decisions?
            </h2>
            <p className="text-xl text-blue-100 mb-10">
              No credit card required. Get started in minutes.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/auth/signup"
                className="inline-flex items-center px-8 py-4 bg-white text-blue-600 text-lg font-medium rounded-xl hover:bg-gray-100 transform hover:scale-105 transition-all duration-200 shadow-lg"
              >
                Start Free Trial
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center px-8 py-4 bg-transparent text-white text-lg font-medium rounded-xl hover:bg-white/10 border-2 border-white/30 transition-all duration-200"
              >
                Or book a demo with our team
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-white mb-4">Product</h3>
              <ul className="space-y-2">
                <li><Link to="/features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
                <li><Link to="/api" className="hover:text-white transition-colors">API</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4">Company</h3>
              <ul className="space-y-2">
                <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link to="/press" className="hover:text-white transition-colors">Press</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><Link to="/templates" className="hover:text-white transition-colors">Templates</Link></li>
                <li><Link to="/tutorials" className="hover:text-white transition-colors">Tutorials</Link></li>
                <li><Link to="/webinars" className="hover:text-white transition-colors">Webinars</Link></li>
                <li><Link to="/support" className="hover:text-white transition-colors">Support</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/security" className="hover:text-white transition-colors">Security</Link></li>
                <li><Link to="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-sm">© 2025 RAG Workspace. All rights reserved.</p>
            </div>
            
            <div className="flex space-x-6">
              <a href="#" className="hover:text-white transition-colors" aria-label="Twitter">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="LinkedIn">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="GitHub">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
      
      {/* Add CSS for animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-on-scroll {
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        
        .animate-on-scroll.animate-in {
          animation: fadeInUp 0.8s ease forwards;
        }
      `}} />
    </div>
  );
}