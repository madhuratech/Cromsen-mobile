import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Image,
  Dimensions, ActivityIndicator, Modal, Platform, StatusBar, FlatList,
  TextInput, Animated, RefreshControl, Share
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { THEME_COLORS, FONTS } from '../styling';
import { ShoppingCart, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, ArrowLeft, Plus, Minus } from 'lucide-react-native';
import { productService, getImageUrl, sanitizeData } from '../services/api';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartIcon, CartPlusIcon, FrameIcon, BackIcon, ShareIcon, HeartIcon } from '../components/CustomIcons';






const { width, height } = Dimensions.get('window');

const DEMO_THEME_COLORS = ['#8B4513', '#FF4444', '#4466FF', '#22AA44', '#FFD700'];
const COLOR_LABELS = ['Brown', 'Red', 'Blue', 'Green', 'Yellow'];
const SIZE_OPTIONS = ['1/4', '2/4', '3/4', '4/4', '5/4'];

const NUMPAD = [
  ['1','2','3'], ['4','5','6'], ['7','8','9'], ['.','0','⌫'],
];

export default function ProductDetailScreen({ navigation, route }) {
  const { productId } = route.params || {};
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selColor, setSelColor] = useState(0);
  const [selSize, setSelSize] = useState(0);
  const [selLength, setSelLength] = useState(0);
  const [selFitting, setSelFitting] = useState(0);
  // New state to keep the calculated price separate so UI updates instantly when backend changes
  const [displayPrice, setDisplayPrice] = useState(0);
  const [selVariant, setSelVariant] = useState(0);
  const [selectedGroupedVariants, setSelectedGroupedVariants] = useState({});
  const [customFitting, setCustomFitting] = useState('');
  const [wishlisted, setWishlisted] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [showQtySelector, setShowQtySelector] = useState(false);
  const [qtyInput, setQtyInput] = useState('1');
  const [sqFt, setSqFt] = useState('');
  const [sqFtWidth, setSqFtWidth] = useState('');
  const [sqFtHeight, setSqFtHeight] = useState('');
  const [sqFtAvailable, setSqFtAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(true);
  const [reviewsOpen, setReviewsOpen] = useState(true);
const [sqFtOpen, setSqFtOpen] = useState(false);
  const [localReviews, setLocalReviews] = useState([]);
  const [similarProducts, setSimilarProducts] = useState([]);
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted: checkWishlisted } = useWishlist();
  const { user } = useAuth();
  const { isDarkMode, theme } = useTheme();

  const flatListRef = useRef(null);

  // Auto carousel effect
  useEffect(() => {
    if (!product) return;
    
    const catImg = (Array.isArray(product.category) && product.category[0]?.image) || (product.category?.image) || null;
    const allImgs = [];
    if (product.image) allImgs.push(product.image);
    if (product.imageUrl) allImgs.push(product.imageUrl);
    if (product.imagePath) allImgs.push(product.imagePath);
    if (product.thumbnail) allImgs.push(product.thumbnail);
    if (product.img) allImgs.push(product.img);
    if (product.pic) allImgs.push(product.pic);
    if (product.photo) allImgs.push(product.photo);
    if (product.images?.length > 0) allImgs.push(...product.images);
    if (allImgs.length === 0 && catImg) allImgs.push(catImg);
    
    const raw = [...new Set(allImgs)].filter(Boolean);
    const num = raw.length > 0 ? raw.length : 1;

    if (num <= 1) return;

    const interval = setInterval(() => {
      setActiveImg(prev => {
        const next = (prev + 1) % num;
        try {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({ index: next, animated: true });
          }
        } catch (e) {
          console.log('Carousel scroll error', e);
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [product]);

  useEffect(() => {
    if (productId) load(true);
  }, [productId]);

  // Refresh product details silently every time the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (productId) {
        load(false); // silent refresh
      }
    }, [productId])
  );


  // Periodic refresh to keep UI in sync with backend changes
  // Poll every 30 seconds while this screen is focused
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const interval = setInterval(() => {
      if (productId) load(false);
    }, 30000); // 30s
    return () => clearInterval(interval);
  }, [isFocused, productId]);

  // Load on mount and when product changes
  useEffect(() => {
    if (product && productId) {
      const revs = product.reviews || product.ratingsAndReviews || product.ratingAndReviews || product.productReviews || [];
      // Always try fetching from backend AND merge with local
      productService.getReviews(productId, product.name)
        .then(res => {
          const fetchedRevs = Array.isArray(res) ? res : res.data || res.reviews || [];
          // Merge backend with what's in the product obj too
          const allBackend = [...revs];
          fetchedRevs.forEach(r => {
            if (!allBackend.some(a => (a.comment || a.text) === (r.comment || r.text))) {
              allBackend.push(r);
            }
          });
          mergeWithLocal(productId, allBackend);
        })
        .catch(() => mergeWithLocal(productId, revs));
    }
  }, [product]);

  // Refresh reviews every time screen comes into focus (e.g. after submitting from OrderDetailScreen)
  useFocusEffect(
    React.useCallback(() => {
      if (productId) {
        productService.getReviews(productId, product?.name || '')
          .then(res => {
            const fetchedRevs = Array.isArray(res) ? res : res.data || res.reviews || [];
            mergeWithLocal(productId, fetchedRevs);
          })
          .catch(() => mergeWithLocal(productId, []));
      }
    }, [productId, product])
  );

  // Standalone helper that uses productId directly (no stale closure issue)
  const mergeWithLocal = async (pId, backendRevs) => {
    try {
      // 1. Read from product-specific local store
      const stored = await AsyncStorage.getItem(`@LocalReviews_${pId}`);
      const locals = stored ? JSON.parse(stored) : [];
      
      // 2. Also check the global review store (for reviews saved under any ID format or matched by name)
      const globalStored = await AsyncStorage.getItem('@GlobalLocalReviews');
      const globalList = globalStored ? JSON.parse(globalStored) : [];
      
      // Get current product name for fallback match
      const currentProductName = product?.name || '';
      
      const globalForProduct = globalList.filter(r => {
        const idMatch = r.productId && String(r.productId) === String(pId);
        
        // 1. Exact case-insensitive match
        const exactNameMatch = r.productName && currentProductName && 
          String(r.productName).toLowerCase().trim() === String(currentProductName).toLowerCase().trim();
          
        // 2. Substring matches (e.g., "Grooved" matching "Upvc 16MM Zinc Roller Grooved")
        const substringMatch = r.productName && currentProductName && (
          String(r.productName).toLowerCase().includes(String(currentProductName).toLowerCase().trim()) ||
          String(currentProductName).toLowerCase().includes(String(r.productName).toLowerCase().trim())
        );

        // 3. Word overlap matching (e.g., "UPVC 16MM" matching "UPVC 16MM Zinc Grooved")
        const rKeywords = String(r.productName || '').toLowerCase().split(/[\s\-_,\.\/]+/).filter(w => w.length > 2);
        const pKeywords = String(currentProductName || '').toLowerCase().split(/[\s\-_,\.\/]+/).filter(w => w.length > 2);
        const keywordOverlap = rKeywords.some(w => pKeywords.includes(w)) || pKeywords.some(w => rKeywords.includes(w));
        
        return idMatch || exactNameMatch || substringMatch || keywordOverlap;
      });
      
      // 3. Merge all sources, deduplicate by comment text
      const allLocal = [...locals];
      globalForProduct.forEach(r => {
        if (!allLocal.some(a => (a.comment || a.text || '') === (r.comment || r.text || ''))) {
          allLocal.push(r);
        }
      });

      // 4. Merge backend reviews on top (deduplicated)
      const combined = [...allLocal];
      backendRevs.forEach(br => {
        const brText = br.comment || br.text || '';
        if (!combined.some(c => (c.comment || c.text || '') === brText)) {
          combined.push(br);
        }
      });
      
      console.log(`[REVIEWS] productId=${pId} productName="${currentProductName}" local=${allLocal.length} backend=${backendRevs.length} total=${combined.length}`);
      setLocalReviews(combined);
    } catch (e) {
      setLocalReviews(backendRevs);
    }
  };


  const load = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const d = await productService.getProductById(productId);
      const mainProd = d.data || d;
      setProduct(mainProd);

      // --- Price calculation based on fresh backend data ---
      // Determine user role
      const role = (user?.role || user?.userType || user?.type || 'retailer').toLowerCase();
      // Helper to safely parse numbers
      const parseNum = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
      
      // Base price selection
      let base = parseNum(mainProd.price);
      if (role === 'dealer' && parseNum(mainProd.dealerPrice) > 0) {
        base = parseNum(mainProd.dealerPrice);
      } else if (role === 'retailer' && parseNum(mainProd.retailPrice) > 0) {
        base = parseNum(mainProd.retailPrice);
      } else if (parseNum(mainProd.retailPrice) > 0) {
        base = parseNum(mainProd.retailPrice);
      }

      // Compute dynamic price (variant/length/size) similar to existing logic
      let calcPrice = base;
      const lengths = mainProd.lengths || mainProd.lengthOptions || mainProd.length || [];
      const fittings = mainProd.fittings || mainProd.fittingOptions || mainProd.fiting || mainProd.fitting || [];
      const sizes = mainProd.sizes || mainProd.size || [];
      const variants = mainProd.variants || mainProd.variations || mainProd.varients || mainProd.variant || [];

      const variantItems = mainProd.variantItems || mainProd.variantPrices || [];
      if (variantItems.length > 0) {
        const firstVar = variantItems[0];
        const p1 = parseNum(role === 'dealer' ? (firstVar.wholesalePrice || firstVar.dealerPrice) : (firstVar.retailPrice || firstVar.price));
        calcPrice = p1 > 0 ? p1 : (parseNum(firstVar.price) || calcPrice);
      } else if (variants.length > 0 && typeof variants[0] !== 'string' && variants[0].value) {
        const curVar = variants[selVariant];
        if (curVar && typeof curVar === 'object') {
          const p2 = parseNum(role === 'dealer' ? (curVar.wholesalePrice || curVar.dealerPrice) : (curVar.retailPrice || curVar.price));
          calcPrice = p2 > 0 ? p2 : (parseNum(curVar.price) || calcPrice);
        }
      } else if (lengths.length > 0) {
        const curLen = lengths[selLength];
        if (curLen && typeof curLen === 'object') {
          calcPrice = parseNum(role === 'dealer' ? curLen.dealerPrice : curLen.retailPrice) || parseNum(curLen.price) || calcPrice;
        }
      } else if (sizes.length > 0) {
        const curSize = sizes[selSize];
        if (curSize && typeof curSize === 'object') {
          const sizePrice = parseNum(curSize.price) || parseNum(curSize.retailPrice) || parseNum(curSize.userPrice);
          if (role === 'dealer') {
            calcPrice = parseNum(curSize.dealerPrice) || (typeof mainProd.dealerPrice === 'number' && typeof mainProd.price === 'number' && mainProd.price > 0 ? (sizePrice * (mainProd.dealerPrice / mainProd.price)) : sizePrice);
          } else {
            calcPrice = sizePrice;
          }
        }
      }

      // Add fitting surcharge
      if (fittings.length > 0) {
        const curFit = fittings[selFitting];
        if (curFit && typeof curFit === 'object' && curFit.price) {
          calcPrice += parseNum(curFit.price);
        }
      }

      setDisplayPrice(calcPrice);

      // Fetch similar products based on category (unchanged)
      let catId = null;
      let catName = null;
      if (Array.isArray(mainProd.category)) {
        catId = mainProd.category[0]?._id || mainProd.category[0];
        catName = mainProd.category[0]?.name || mainProd.category[0];
      } else if (typeof mainProd.category === 'object') {
        catId = mainProd.category?._id;
        catName = mainProd.category?.name;
      } else {
        catId = mainProd.category || mainProd.categoryId;
        catName = mainProd.category;
      }
      let simList = [];
      if (catId) {
        const sim = await productService.getProducts({ category: catId, limit: 6 });
        simList = Array.isArray(sim) ? sim : sim.data || sim.products || [];
      }
      if (simList.length === 0 && catName && typeof catName === 'string') {
        const sim = await productService.getProducts({ keyword: catName, limit: 6 });
        simList = Array.isArray(sim) ? sim : sim.data || sim.products || [];
      }
      setSimilarProducts(simList.filter(p => (p._id || p.id) !== productId));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const calculateSquareFeet = (width, height) => {
    if (!width || !height) return null;
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return null;
    return w * h;
  };

  const handleSqFtWidthChange = (val) => {
    setSqFtWidth(val);
    const calculated = calculateSquareFeet(val, sqFtHeight);
    if (calculated !== null) {
      const maxSqFt = product?.maxSquareFeet || product?.maxSqFt || product?.squareFeetLimit || null;
      if (maxSqFt && calculated > maxSqFt) {
        setSqFtAvailable(false);
      } else {
        setSqFtAvailable(true);
        setSqFt(calculated.toString());
      }
    }
  };

  const handleSqFtHeightChange = (val) => {
    setSqFtHeight(val);
    const calculated = calculateSquareFeet(sqFtWidth, val);
    if (calculated !== null) {
      const maxSqFt = product?.maxSquareFeet || product?.maxSqFt || product?.squareFeetLimit || null;
      if (maxSqFt && calculated > maxSqFt) {
        setSqFtAvailable(false);
      } else {
        setSqFtAvailable(true);
        setSqFt(calculated.toString());
      }
    }
  };

  const handleNumpad = (val) => {
    if (val === '⌫') setQtyInput(q => q.length > 1 ? q.slice(0, -1) : '1');
    else setQtyInput(q => q === '1' ? val : q + val);
  };

  // Animations
  const scrollY = useRef(new Animated.Value(0)).current;

  const handleShare = async () => {
    try {
      if (!product) return;
      const shareUrl = `https://cromsennest.com/product/${product.slug || product._id || product.id}`;
      const message = `Check out ${sanitizeData(product.name, 'this product')} on Cromsen!\n\n${shareUrl}`;
      await Share.share({
        message,
        url: shareUrl, // iOS only
        title: sanitizeData(product.name, 'Product'),
      });
    } catch (error) {
      console.warn("Error sharing product:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading && !refreshing) return (
    <View style={[s.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.secondary} size="large" />
    </View>
  );
  if (!product) return (
    <View style={[s.center, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.textSecondary }}>Product not found</Text>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
        <Text style={{ color: theme.primary, fontWeight: '700' }}>← Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const categoryImage = (Array.isArray(product.category) && product.category[0]?.image) || 
                        (product.category?.image) || null;

  const allImgs = [];
  if (product.image) allImgs.push(product.image);
  if (product.imageUrl) allImgs.push(product.imageUrl);
  if (product.imagePath) allImgs.push(product.imagePath);
  if (product.thumbnail) allImgs.push(product.thumbnail);
  if (product.img) allImgs.push(product.img);
  if (product.pic) allImgs.push(product.pic);
  if (product.photo) allImgs.push(product.photo);
  if (product.images?.length > 0) allImgs.push(...product.images);
  if (allImgs.length === 0 && categoryImage) allImgs.push(categoryImage);

  const rawImgs = [...new Set(allImgs)].filter(Boolean);
  
  const imgs = rawImgs.length > 0 
    ? rawImgs.map(getImageUrl) 
    : ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800'];

  const userRole = (user?.role || user?.userType || user?.type || 'retailer').toLowerCase();
  
  // Base price derived from backend (already calculated in load())
  const parseNum = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
  
  let basePrice = 0;
  if (product) {
    basePrice = parseNum(product.price);
    if (userRole === 'dealer' && parseNum(product.dealerPrice) > 0) {
      basePrice = parseNum(product.dealerPrice);
    } else if (userRole === 'retailer' && parseNum(product.retailPrice) > 0) {
      basePrice = parseNum(product.retailPrice);
    } else if (parseNum(product.retailPrice) > 0) {
      basePrice = parseNum(product.retailPrice);
    }
  }
  // Use the pre‑computed displayPrice for rendering. If not yet set, fall back to basePrice.
  let price = displayPrice || basePrice;
  
  // 1. Dynamic Size/Length/Fitting Price Calculation (kept for future extensions)
  const lengths = product?.lengths || product?.lengthOptions || product?.length || [];
  const fittings = product?.fittings || product?.fittingOptions || product?.fiting || product?.fitting || [];
  const sizes = product?.sizes || product?.size || [];
  const variants = product?.variants || product?.variations || product?.varients || product?.variant || [];

  const groupedVariants = (!variants || variants.length === 0) ? {} : variants.reduce((acc, v) => {
    let name = v.name || 'Option';
    if (typeof v === 'string') {
      if (!acc['Variant']) acc['Variant'] = [];
      acc['Variant'].push(v);
    } else {
      if (!acc[name]) acc[name] = [];
      if (v.options && Array.isArray(v.options)) {
        acc[name].push(...v.options);
      } else if (v.value) {
        acc[name].push(v.value);
      }
    }
    return acc;
  }, {});

  const selectedOptions = Object.entries(groupedVariants).map(([groupName, options]) => {
    const selectedIdx = selectedGroupedVariants[groupName] || 0;
    return options[selectedIdx];
  }).filter(Boolean);

  const variantItems = product?.variantItems || product?.variantPrices || [];
  let activeTargetVar = null;
  if (variantItems.length > 0) {
    const matchedVariant = variantItems.find(vp => {
      if (!vp.combination) return false;
      // Backend combination string is usually like "Darkbrown / Printed / Single Door"
      // or "Red / 2.18MM"
      // Let's check if every selected option is somewhere in the combination string
      return selectedOptions.every(opt => vp.combination.includes(opt));
    });

    if (matchedVariant || variantItems.length > 0) {
      activeTargetVar = matchedVariant || variantItems[0];
      const dPrice = parseNum(activeTargetVar.wholesalePrice) || parseNum(activeTargetVar.dealerPrice);

      const rPrice = parseNum(activeTargetVar.retailPrice) || parseNum(activeTargetVar.price);
      const mPrice = parseNum(activeTargetVar.price);
      
      const vPrice = userRole === 'dealer' ? dPrice : rPrice;
      if (vPrice > 0) {
        price = vPrice;
      } else if (mPrice > 0) {
        price = mPrice;
      }
    }
  } else if (variants.length > 0 && typeof variants[0] !== 'string' && variants[0].value) {
    let currentVariant = variants[selVariant];
    if (selectedOptions.length > 0) {
      const matched = variants.find(v => v.value && selectedOptions.includes(v.value));
      if (matched) currentVariant = matched;
    }

    if (typeof currentVariant === 'object') {
       const dPrice = parseNum(currentVariant.wholesalePrice) || parseNum(currentVariant.dealerPrice);
       const rPrice = parseNum(currentVariant.retailPrice);
       const mPrice = parseNum(currentVariant.price);
       const vPrice = userRole === 'dealer' ? dPrice : rPrice;
       price = vPrice > 0 ? vPrice : (mPrice > 0 ? mPrice : price);
    }
  } else if (lengths.length > 0) {
    const currentLength = lengths[selLength];
    if (typeof currentLength === 'object') {
       const dPrice = parseNum(currentLength.dealerPrice);
       const rPrice = parseNum(currentLength.retailPrice);
       const mPrice = parseNum(currentLength.price);
       const vPrice = userRole === 'dealer' ? dPrice : rPrice;
       price = vPrice > 0 ? vPrice : (mPrice > 0 ? mPrice : price);
    }
  } else if (sizes.length > 0) {
    const currentSizeObj = sizes[selSize];
    if (currentSizeObj && typeof currentSizeObj === 'object') {
      const sizePrice = parseNum(currentSizeObj.price) || parseNum(currentSizeObj.retailPrice) || parseNum(currentSizeObj.userPrice);
      if (userRole === 'dealer') {
        const dPrice = parseNum(currentSizeObj.dealerPrice);
        if (dPrice > 0) {
          price = dPrice;
        } else if (parseNum(product.dealerPrice) > 0 && parseNum(product.price) > 0) {
          const ratio = parseNum(product.dealerPrice) / parseNum(product.price);
          price = (sizePrice || parseNum(basePrice)) * ratio;
        } else {
          price = sizePrice || parseNum(basePrice);
        }
      } else {
        price = sizePrice || parseNum(basePrice);
      }
    }
  }

  // Add Fitting Surcharge if applicable
  if (fittings.length > 0) {
    const currentFitting = fittings[selFitting];
    if (typeof currentFitting === 'object' && currentFitting.price) {
      price += (parseFloat(currentFitting.price) || 0);
    }
  }

  // Calculate final custom sqFt size
  let finalSqFtValue = 0;
  if (product?.isCustomSizeEnabled && sqFtWidth && sqFtHeight) {
    const w = parseFloat(sqFtWidth) || 0;
    const h = parseFloat(sqFtHeight) || 0;
    if (w > 0 && h > 0) {
      finalSqFtValue = w * h;
    }
  }

  let customRate = 0;
  if (product?.isCustomSizeEnabled) {
    if (userRole === 'dealer') {
       customRate = parseNum(product.pricePerSqFtDealer) || parseNum(product.customPricePerSqFtDealer) || parseNum(product.customSqFtPriceDealer) || parseNum(product.dealerCustomSqFtPrice) || parseNum(product.dealerPricePerSqFt) || parseNum(product.customPriceDealer);
    } 
    if (!customRate) {
       customRate = parseNum(product.pricePerSqFtRetail) || parseNum(product.customPricePerSqFtRetail) || parseNum(product.customSqFtPriceRetail) || parseNum(product.retailCustomSqFtPrice) || parseNum(product.retailPricePerSqFt) || parseNum(product.customPricePerSqFt) || parseNum(product.customPriceRetail);
    }
  }

  let isCustomSqFtApplied = false;
  if (product?.isCustomSizeEnabled && finalSqFtValue > 0 && customRate > 0) {
    price = customRate; 
    isCustomSqFtApplied = true;
  }

  // Add Installation Fee if required
  const activeFeeCgst = activeTargetVar && activeTargetVar.cgst !== undefined ? activeTargetVar.cgst : product?.cgst;
  const activeFeeSgst = activeTargetVar && activeTargetVar.sgst !== undefined ? activeTargetVar.sgst : product?.sgst;
  const activeFeePkg = activeTargetVar && (activeTargetVar.packagingFee !== undefined || activeTargetVar.packagingPrice !== undefined) ? (activeTargetVar.packagingFee !== undefined ? activeTargetVar.packagingFee : activeTargetVar.packagingPrice) : (product?.packagingFee !== undefined ? product?.packagingFee : product?.packagingPrice);
  const activeFeeShip = activeTargetVar && (activeTargetVar.shippingFee !== undefined || activeTargetVar.shippingPrice !== undefined) ? (activeTargetVar.shippingFee !== undefined ? activeTargetVar.shippingFee : activeTargetVar.shippingPrice) : (product?.shippingFee !== undefined ? product?.shippingFee : product?.shippingPrice);
  const activeFeeInst = activeTargetVar && (activeTargetVar.installationFee !== undefined || activeTargetVar.installationPrice !== undefined) ? (activeTargetVar.installationFee !== undefined ? activeTargetVar.installationFee : activeTargetVar.installationPrice) : (product?.installationFee !== undefined ? product?.installationFee : product?.installationPrice);
  const activeInstRate = activeTargetVar && (activeTargetVar.installationRatePerSqFt !== undefined || activeTargetVar.installationRate !== undefined) ? (activeTargetVar.installationRatePerSqFt !== undefined ? activeTargetVar.installationRatePerSqFt : activeTargetVar.installationRate) : (product?.installationRatePerSqFt !== undefined ? product?.installationRatePerSqFt : (product?.installationRate || 0));


  const rating = product.ratings || 4.7;

  const HIGHLIGHTS = [
    { k: 'Dimensions', v1: '3.5kg', v2: '3.5kg' },
    { k: '', v1: '2.0kg', v2: '2.5kg' },
    { k: '', v1: '3.0kg', v2: '3.5kg' },
    { k: '', v1: '2.0kg', v2: '2.5kg' },
  ];

  const REVIEWS = localReviews;


  const SIMILAR = [
    { id: 's1', name: 'Honeycomb Insul...', price: 899, image: imgs[0] },
    { id: 's2', name: 'Honeycomb Insul...', price: 899, image: imgs[0] },
    { id: 's3', name: 'Albi...', price: 899, image: imgs[0] },
  ];

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />

      {/* Floating header */}
      <View style={[s.floatBar, { paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 24) + 10 }]}>
        <TouchableOpacity style={[s.fab, { backgroundColor: isDarkMode ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.9)' }]} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={s.fabRow}>
          <TouchableOpacity style={[s.fab, { backgroundColor: isDarkMode ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.9)' }]} onPress={() => product && toggleWishlist(product)}>
            <HeartIcon 
              size={16} 
              color={product && checkWishlisted(product._id || product.id) ? theme.error : theme.text} 
              filled={product && checkWishlisted(product._id || product.id)} 
            />
          </TouchableOpacity>
          <TouchableOpacity style={[s.fab, { backgroundColor: isDarkMode ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.9)' }]} onPress={handleShare}>
            <ShareIcon color={theme.text} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME_COLORS.primary]} tintColor={THEME_COLORS.primary} />
        }
      >
        {/* Image Carousel */}
        <View>
          <FlatList
            ref={flatListRef}
            data={imgs}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={info => {
              const wait = new Promise(resolve => setTimeout(resolve, 500));
              wait.then(() => {
                try {
                  if (flatListRef.current) {
                    flatListRef.current.scrollToIndex({ index: info.index, animated: true });
                  }
                } catch (e) {}
              });
            }}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveImg(newIndex);
            }}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={s.mainImg} resizeMode="cover" />
            )}
            keyExtractor={(_, i) => i.toString()}
          />
          
          {/* Dot indicators inside/below image */}
          <View style={[s.dots, { backgroundColor: theme.background }]}>
            {imgs.map((_, i) => (
              <View key={i} style={[s.dot, { backgroundColor: theme.border }, i === activeImg && { backgroundColor: theme.primary, width: 18 }]} />
            ))}
          </View>
        </View>


        <View style={[s.card, { backgroundColor: theme.background }]}>
          {/* Color selector (Conditional) */}
          {product.colors && product.colors.length > 0 ? (
            <View>
              <Text style={[s.colorLabel, { color: theme.textSecondary }]}>
                Color: <Text style={[s.colorVal, { color: theme.text }]}>{product.colors[selColor] || product.colors[0]}</Text>
              </Text>
              <View style={s.colorRow}>
                {product.colors.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      s.colorCircle, 
                      { backgroundColor: c?.hex || c?.value || c?.color || (typeof c === 'string' ? c.toLowerCase() : '#ccc') }, 
                      selColor === i && s.colorCircleActive
                    ]}
                    onPress={() => setSelColor(i)}
                  />
                ))}
              </View>
            </View>
          ) : product.color && product.color.length > 0 ? (
             <View>
              <Text style={[s.colorLabel, { color: theme.textSecondary }]}>
                Color: <Text style={[s.colorVal, { color: theme.text }]}>{COLOR_LABELS[selColor]}</Text>
              </Text>
              <View style={s.colorRow}>
                {DEMO_THEME_COLORS.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.colorCircle, { backgroundColor: c }, selColor === i && s.colorCircleActive]}
                    onPress={() => setSelColor(i)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Length Selection */}
          {lengths.length > 0 && (
            <View style={[s.optionSection, { borderTopWidth: 0 }]}>
              <Text style={[s.colorLabel, { color: theme.textSecondary }]}>Length: <Text style={{ color: theme.text }}>{typeof lengths[selLength] === 'object' ? lengths[selLength].name : lengths[selLength]}</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.optionsRow}>
                {lengths.map((len, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.optionChip, selLength === i && s.optionChipActive]}
                    onPress={() => setSelLength(i)}
                  >
                    <Text style={[s.optionChipTxt, selLength === i && { color: '#FFF' }]}>
                      {typeof len === 'object' ? len.name : len}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Fitting Selection */}
          {fittings.length > 0 && (
            <View style={s.optionSection}>
              <Text style={[s.colorLabel, { color: theme.textSecondary }]}>Fitting: <Text style={{ color: theme.text }}>{typeof fittings[selFitting] === 'object' ? fittings[selFitting].name : fittings[selFitting]}</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.optionsRow}>
                {fittings.map((fit, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.optionChip, selFitting === i && s.optionChipActive]}
                    onPress={() => setSelFitting(i)}
                  >
                    <Text style={[s.optionChipTxt, selFitting === i && { color: '#FFF' }]}>
                      {typeof fit === 'object' ? fit.name : fit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Custom Fitting Input */}
              <View style={{ marginTop: 12 }}>
                <Text style={[s.colorLabel, { fontSize: 11, marginBottom: 4 }]}>Or provide Custom Fitting Specs:</Text>
                <TextInput
                  style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  placeholder="Enter details (e.g. 15mm holes, specific gap...)"
                  placeholderTextColor={theme.textSecondary}
                  value={customFitting}
                  onChangeText={setCustomFitting}
                />
              </View>
            </View>
          )}

          {/* Variant Selection */}
          {Object.entries(groupedVariants).map(([groupName, options], gIdx) => {
            if (options.length === 0) return null;
            const selectedIdx = selectedGroupedVariants[groupName] || 0;
            return (
              <View key={gIdx} style={s.optionSection}>
                <Text style={[s.colorLabel, { color: theme.textSecondary }]}>
                  {groupName}: <Text style={{ color: theme.text }}>{options[selectedIdx]}</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.optionsRow}>
                  {options.map((opt, oIdx) => (
                    <TouchableOpacity
                      key={oIdx}
                      style={[s.optionChip, selectedIdx === oIdx && s.optionChipActive]}
                      onPress={() => setSelectedGroupedVariants(prev => ({ ...prev, [groupName]: oIdx }))}
                    >
                      <Text style={[s.optionChipTxt, selectedIdx === oIdx && { color: '#FFF' }]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {/* Existing Size chart (Conditional) */}
          {lengths.length === 0 && ((product.sizes && product.sizes.length > 0) || (product.size && product.size.length > 0)) ? (
            <View style={s.sizeRow}>
              <Text style={s.colorLabel}>Size: </Text>
              {(product.sizes || product.size || SIZE_OPTIONS).map((sz, i) => {
                 const szLabel = typeof sz === 'string' ? sz : sz.name || sz.label || sz;
                 return (
                   <TouchableOpacity
                     key={i}
                     style={[s.sizeChip, selSize === i && s.sizeChipActive]}
                     onPress={() => setSelSize(i)}
                   >
                     <Text style={[s.sizeChipTxt, selSize === i && { color: '#FFF' }]}>{szLabel}</Text>
                   </TouchableOpacity>
                 );
              })}
              <TouchableOpacity onPress={() => {/* Show Size Chart logic */}}>
                <Text style={s.sizeChartLink}>Size Chart</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Product name & rating */}
          <View style={s.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.catName, { color: theme.textSecondary }]}>{product.category?.name || 'Category'}</Text>
              <Text style={[s.productName, { color: theme.text }]}>
                {sanitizeData(product.name, 'Product')}
              </Text>
            </View>
            <View style={s.priceRatingRow}>
              <View>
                <Text style={[s.priceTxt, { color: theme.primary }]}>
                  ₹{(price * (isCustomSqFtApplied ? finalSqFtValue : 1)).toLocaleString()}
                </Text>
                {isCustomSqFtApplied && (
                  <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'right' }}>
                    (₹{price}/sq.ft x {finalSqFtValue.toFixed(2)})
                  </Text>
                )}
              </View>
              <View style={[s.ratingChip, { backgroundColor: isDarkMode ? '#064E3B' : '#F0FFF4' }]}>
                <Text style={[s.ratingTxt, { color: isDarkMode ? '#10B981' : '#22C55E' }]}>★ {rating}</Text>
              </View>
            </View>
          </View>

          {/* Dynamic Fees Display */}
          {(parseFloat(activeFeeCgst || 0) > 0 || parseFloat(activeFeeSgst || 0) > 0 || parseFloat(activeFeePkg || 0) > 0 || parseFloat(activeFeeShip || 0) > 0 || parseFloat(activeFeeInst || 0) > 0 || parseFloat(activeInstRate || 0) > 0) && (
            <View style={{ padding: 12, backgroundColor: theme.surface || (isDarkMode ? '#1E293B' : '#F8FAFC'), borderRadius: 12, borderWidth: 1, borderColor: theme.border || '#E2E8F0', marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 8 }}>Additional Charges & Taxes</Text>
              
              {parseFloat(activeFeeCgst || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>CGST ({activeFeeCgst}%)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{((price * parseFloat(activeFeeCgst)) / 100).toFixed(2)}</Text>
                </View>
              )}
              {parseFloat(activeFeeSgst || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>SGST ({activeFeeSgst}%)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{((price * parseFloat(activeFeeSgst)) / 100).toFixed(2)}</Text>
                </View>
              )}
              {parseFloat(activeFeePkg || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>Packaging Fee</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{parseFloat(activeFeePkg).toFixed(2)}</Text>
                </View>
              )}
              {parseFloat(activeFeeShip || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>Shipping Fee</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{parseFloat(activeFeeShip).toFixed(2)}</Text>
                </View>
              )}
              {parseFloat(activeFeeInst || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>Base Installation Fee</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{parseFloat(activeFeeInst).toFixed(2)}</Text>
                </View>
              )}
              {parseFloat(activeInstRate || 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 }}>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>Installation (Per Sq.Ft)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>₹{parseFloat(activeInstRate).toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}


          {/* Add to Cart + Buy Now */}
          <View style={s.ctaRow}>
            {showQtySelector ? (
              <View style={s.inlineQtySelector}>
                <TouchableOpacity 
                  style={s.inlineQtyBtn} 
                  onPress={() => {
                    const q = parseInt(qtyInput) || 1;
                    if (q > 1) setQtyInput(String(q - 1));
                    else setShowQtySelector(false);
                  }}
                >
                  <Minus size={20} color={THEME_COLORS.primary} />
                </TouchableOpacity>
                
                <TouchableOpacity style={s.inlineQtyDisplay} onPress={() => setShowQtyModal(true)}>
                  <Text style={s.inlineQtyTxt}>{qtyInput}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={s.inlineQtyBtn} 
                  onPress={() => {
                    const q = parseInt(qtyInput) || 1;
                    setQtyInput(String(q + 1));
                  }}
                >
                  <Plus size={20} color={THEME_COLORS.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={s.addCartBtn}
                onPress={() => {
                  setShowQtySelector(true);
                  const lenLabel = lengths.length > 0 ? (typeof lengths[selLength] === 'object' ? lengths[selLength].name : lengths[selLength]) : '';
                  const fitLabel = fittings.length > 0 ? (typeof fittings[selFitting] === 'object' ? fittings[selFitting].name : fittings[selFitting]) : '';
                  const sizeLabel = sizes.length > 0 ? (typeof sizes[selSize] === 'object' ? sizes[selSize].name : sizes[selSize]) : '';
                  const colorLabel = (product.colors || product.color || COLOR_LABELS)[selColor]?.name || (product.colors || product.color || COLOR_LABELS)[selColor] || '';
                  
                  const finalSqFt = sqFt || '1';
                  
                  let variantStr = '';
                  Object.entries(groupedVariants).forEach(([groupName, options]) => {
                    if (options.length > 0) {
                      const selectedIdx = selectedGroupedVariants[groupName] || 0;
                      if (options[selectedIdx]) {
                        variantStr += `${groupName}: ${options[selectedIdx]}, `;
                      }
                    }
                  });
                  if (lenLabel) variantStr += `Length: ${lenLabel}, `;
                  if (fitLabel) variantStr += `Fitting: ${fitLabel}, `;
                  if (customFitting.trim()) variantStr += `Custom Fit: ${customFitting.trim()}, `;
                  if (sizeLabel && !lenLabel) variantStr += `Size: ${sizeLabel}, `;
                  if (colorLabel) variantStr += `Color: ${colorLabel}, `;
                  variantStr += `SqFt: ${finalSqFt}`;
                  variantStr = variantStr.replace(/, $/, '');

                  addToCart({
                    id: product._id || product.id,
                    name: product.name,
                    price: typeof price === 'number' ? price : (parseFloat(price) || 0),
                    priceSource: 'productDetail',
                    variant: variantStr,
                    image: imgs[activeImg],
                    sqFt: finalSqFt,
                    installationRatePerSqFt: parseFloat(activeInstRate || 0),
                    baseInstallationPrice: parseFloat(activeFeeInst || 0),
                    cgst: parseFloat(activeFeeCgst || 0),
                    sgst: parseFloat(activeFeeSgst || 0),
                    shippingFee: parseFloat(activeFeeShip || 0),
                    packagingFee: parseFloat(activeFeePkg || 0),
                  }, parseInt(qtyInput) || 1);

                }}
              >
                <CartIcon size={20} color={THEME_COLORS.primary} />
                <Text style={s.addCartTxt}>Add to Cart</Text>
              </TouchableOpacity>
            )}
 
            <TouchableOpacity style={s.buyNowBtn} onPress={() => {
              const lenLabel = lengths.length > 0 ? (typeof lengths[selLength] === 'object' ? lengths[selLength].name : lengths[selLength]) : '';
              const fitLabel = fittings.length > 0 ? (typeof fittings[selFitting] === 'object' ? fittings[selFitting].name : fittings[selFitting]) : '';
              const sizeLabel = sizes.length > 0 ? (typeof sizes[selSize] === 'object' ? sizes[selSize].name : sizes[selSize]) : '';
              const colorLabel = (product.colors || product.color || COLOR_LABELS)[selColor]?.name || (product.colors || product.color || COLOR_LABELS)[selColor] || '';
              
              const finalSqFt = sqFt || '1';
              
              let variantStr = '';
              Object.entries(groupedVariants).forEach(([groupName, options]) => {
                if (options.length > 0) {
                  const selectedIdx = selectedGroupedVariants[groupName] || 0;
                  if (options[selectedIdx]) {
                    variantStr += `${groupName}: ${options[selectedIdx]}, `;
                  }
                }
              });
              if (lenLabel) variantStr += `Length: ${lenLabel}, `;
              if (fitLabel) variantStr += `Fitting: ${fitLabel}, `;
              if (customFitting.trim()) variantStr += `Custom Fit: ${customFitting.trim()}, `;
              if (sizeLabel && !lenLabel) variantStr += `Size: ${sizeLabel}, `;
              if (colorLabel) variantStr += `Color: ${colorLabel}, `;
              variantStr += `SqFt: ${finalSqFt}`;
              variantStr = variantStr.replace(/, $/, '');
 
              const directItem = {
                id: product._id || product.id,
                _id: product._id || product.id,
                name: product.name,
                price: typeof price === 'number' ? price : (parseFloat(price) || 0),
                installationRatePerSqFt: parseFloat(activeInstRate || 0),
                baseInstallationPrice: parseFloat(activeFeeInst || 0),
                priceSource: 'productDetail',
                variant: variantStr,
                image: imgs[activeImg],
                quantity: parseInt(qtyInput) || 1,
                // installation handled in Checkout screen
                sqFt: finalSqFt,
                cgst: parseFloat(activeFeeCgst || 0),
                sgst: parseFloat(activeFeeSgst || 0),
                shippingFee: parseFloat(activeFeeShip || 0),
                packagingFee: parseFloat(activeFeePkg || 0)
              };

              navigation.navigate('Checkout', { directItem });
            }}>
              <Text style={s.buyNowTxt}>Buy Now</Text>
            </TouchableOpacity>
          </View>

          {/* SQUARE FEET CALCULATION (Conditional) */}
          {product.isCustomSizeEnabled && (
            <View>
              <TouchableOpacity style={s.collapseHeader} onPress={() => setSqFtOpen(!sqFtOpen)}>
                <Text style={s.collapseTitle}>Square Feet (sq.ft)</Text>
                {sqFtOpen ? <ChevronUp size={18} color={theme.text} /> : <ChevronDown size={18} color={theme.text} />}
              </TouchableOpacity>
              {sqFtOpen && (
                <View style={[s.sqFtCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[s.sqFtTitle, { color: theme.text }]}>Square Feet (sq.ft)</Text>
                  <Text style={[s.sqFtSubtitle, { color: theme.textSecondary }]}>Enter your custom size</Text>
                  {customRate > 0 && (
                    <Text style={{ fontSize: 14, color: theme.primary, fontWeight: '700', marginTop: 4, marginBottom: 8 }}>
                      Rate: ₹{customRate} / sq.ft
                    </Text>
                  )}

                  <View style={s.sqFtInputRow}>
                    <View style={s.sqFtInputGroup}>
                      <Text style={[s.sqFtInputLabel, { color: theme.textSecondary }]}>Width (FT)</Text>
                      <View style={s.sqFtInputWrapper}>
                        <TouchableOpacity style={s.sqFtStepBtnInside} onPress={() => {
                          const newVal = Math.max(0, parseFloat(sqFtWidth) - 1);
                          handleSqFtWidthChange(newVal.toString());
                        }}>
                          <Minus size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                        <TextInput
                          style={[s.sqFtInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, textAlign: 'center', paddingLeft: 30, paddingRight: 30 }]}
                          placeholder="0"
                          placeholderTextColor={theme.textSecondary}
                          value={sqFtWidth}
                          onChangeText={handleSqFtWidthChange}
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity style={s.sqFtStepBtnInsideRight} onPress={() => {
                          const newVal = (parseFloat(sqFtWidth) || 0) + 1;
                          handleSqFtWidthChange(newVal.toString());
                        }}>
                          <Plus size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={s.sqFtInputGroup}>
                      <Text style={[s.sqFtInputLabel, { color: theme.textSecondary }]}>Height (FT)</Text>
                      <View style={s.sqFtInputWrapper}>
                        <TouchableOpacity style={s.sqFtStepBtnInside} onPress={() => {
                          const newVal = Math.max(0, parseFloat(sqFtHeight) - 1);
                          handleSqFtHeightChange(newVal.toString());
                        }}>
                          <Minus size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                        <TextInput
                          style={[s.sqFtInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, textAlign: 'center', paddingLeft: 30, paddingRight: 30 }]}
                          placeholder="0"
                          placeholderTextColor={theme.textSecondary}
                          value={sqFtHeight}
                          onChangeText={handleSqFtHeightChange}
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity style={s.sqFtStepBtnInsideRight} onPress={() => {
                          const newVal = (parseFloat(sqFtHeight) || 0) + 1;
                          handleSqFtHeightChange(newVal.toString());
                        }}>
                          <Plus size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {sqFtWidth && sqFtHeight && (
                    <View style={[s.sqFtResult, { backgroundColor: sqFtAvailable ? '#E0F2FE' : '#FEE2E2' }]}>
                      {sqFtAvailable ? (
                        <>
                          <Text style={[s.sqFtResultLabel, { color: '#0369A1' }]}>Calculated Size</Text>
                          <Text style={[s.sqFtResultValue, { color: theme.primary }]}>{calculateSquareFeet(sqFtWidth, sqFtHeight)?.toFixed(2)} sq.ft</Text>
                          {product?.maxSquareFeet && (
                            <Text style={[s.sqFtLimit, { color: '#0369A1' }]}>Max: {product.maxSquareFeet} sq.ft</Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Text style={[s.sqFtResultLabel, { color: '#DC2626' }]}>Size Exceeded</Text>
                          <Text style={[s.sqFtResultValue, { color: '#DC2626' }]}>Not Available</Text>
                          <Text style={[s.sqFtLimit, { color: '#DC2626' }]}>Max limit: {product?.maxSquareFeet} sq.ft</Text>
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}





          {/* RATINGS & REVIEWS (collapsible) */}
          <TouchableOpacity style={s.collapseHeader} onPress={() => setReviewsOpen(!reviewsOpen)}>
            <Text style={s.collapseTitle}>Ratings & Reviews {localReviews.length > 0 ? `(${localReviews.length})` : ''}</Text>
            {reviewsOpen ? <ChevronUp size={18} color={THEME_COLORS.text} /> : <ChevronDown size={18} color={THEME_COLORS.text} />}
          </TouchableOpacity>
          {reviewsOpen && (
            <View>
              {localReviews.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ color: THEME_COLORS.textSecondary, fontSize: 14, fontWeight: '600' }}>No reviews yet.</Text>
                  <Text style={{ color: THEME_COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>Buy this product and be the first to review!</Text>
                </View>
              ) : (
                localReviews.map((r, i) => (
                  <View key={i} style={s.reviewCard}>
                    <View style={s.reviewTop}>
                      <View style={s.reviewStarBadge}>
                        <Text style={s.reviewStarBadgeTxt}>★ {r.rating || 5}/5</Text>
                      </View>
                      <Text style={s.reviewUserName}>{r.userName}</Text>
                      <Text style={s.reviewTime}>
                        {r.time ? new Date(r.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </Text>
                    </View>
                    {r.images && r.images.length > 0 && (
                      <View style={s.reviewImages}>
                        {r.images.map((img, idx) => (
                          <Image key={idx} source={{ uri: img }} style={s.reviewImg} />
                        ))}
                      </View>
                    )}
                    <Text style={s.reviewComment}>{r.comment || r.text || r.review || ''}</Text>
                    <View style={s.reviewActions}>
                      {(r.userImage || r.image || r.avatar) ? (
                        <Image source={{ uri: getImageUrl(r.userImage || r.image || r.avatar) }} style={s.reviewAvatar} />
                      ) : null}
                      <Text style={s.reviewerName}>{r.name || r.username || 'Anonymous'}</Text>
                      <View style={s.reviewLikes}>
                        <TouchableOpacity style={s.likeBtn}>
                          <ThumbsUp size={12} color={THEME_COLORS.textSecondary} />
                          <Text style={s.likeTxt}>{r.likes || 0}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.likeBtn}>
                          <ThumbsDown size={12} color={THEME_COLORS.textSecondary} />
                          <Text style={s.likeTxt}>{r.dislikes || 0}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}


          {/* SIMILAR PRODUCTS */}
          {similarProducts.length > 0 && (
            <>
              <View style={s.collapseHeader}>
                <Text style={s.collapseTitle}>Similar Products</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {similarProducts.map((p) => (
                  <TouchableOpacity 
                    key={p._id || p.id} 
                    style={s.similarCard}
                    onPress={() => {
                      const pId = p._id || p.id;
                      navigation.push('ProductDetail', { productId: pId });
                    }}
                  >
                    <Image source={{ uri: getImageUrl(p.image || p.thumbnail) }} style={s.similarImg} />
                    <TouchableOpacity style={s.similarHeart} onPress={() => {
                      toggleWishlist(p);
                      if (!checkWishlisted(p._id || p.id)) {
                        navigation.navigate('Wishlist');
                      }
                    }}>
                      <HeartIcon 
                        size={12} 
                        color={checkWishlisted(p._id || p.id) ? THEME_COLORS.error : THEME_COLORS.textSecondary} 
                        filled={checkWishlisted(p._id || p.id)}
                      />
                    </TouchableOpacity>

                    <View style={s.similarInfo}>
                      <Text style={s.similarName} numberOfLines={1}>{sanitizeData(p.name, 'Product')}</Text>
                      <View style={s.similarBottom}>
                        {(() => {
                          const pPrice = userRole === 'dealer'
                            ? (typeof p.dealerPrice === 'number' ? p.dealerPrice : p.price || 0)
                            : (typeof p.retailPrice === 'number' ? p.retailPrice : p.price || 0);
                          return (
                            <>
                              <Text style={s.similarPrice}>₹{Number(pPrice).toLocaleString()}</Text>
                              <TouchableOpacity 
                                style={s.similarAdd}
                                  onPress={() => {
                                  addToCart({
                                    ...p,
                                    id: p._id || p.id,
                                    price: pPrice,
                                    image: getImageUrl(p.image || p.thumbnail),
                                    installationRatePerSqFt: parseFloat(p.installationRatePerSqFt || p.installationRatePerSqft || p.installationPricePerSqft || p.installationPerSqFt || p.installationRate || 0) || 0,
                                    baseInstallationPrice: parseFloat(p.installationPrice || p.installationFee || p.installationCost || 0) || 0,
                                  }, 1);
                                  navigation.navigate('Cart');
                                }}
                              >
                                <FrameIcon size={20} />
                              </TouchableOpacity>
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>

      {/* QUANTITY MODAL (numpad) */}
      <Modal visible={showQtyModal} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowQtyModal(false)} />
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Enter Quantity</Text>
          <Text style={s.modalSubtitle}>Quantity</Text>
          <View style={s.qtyDisplay}>
            <Text style={s.qtyDisplayTxt}>{qtyInput}</Text>
          </View>
          <View style={s.numpad}>
            {NUMPAD.map((row, ri) => (
              <View key={ri} style={s.numRow}>
                {row.map((val) => (
                  <TouchableOpacity key={val} style={s.numKey} onPress={() => handleNumpad(val)}>
                    <Text style={s.numKeyTxt}>{val}</Text>
                  </TouchableOpacity>
                ))}
                {ri === 0 && <TouchableOpacity style={s.numKeyWide}><Text style={s.numKeyTxt}>←</Text></TouchableOpacity>}
                {ri === 1 && <TouchableOpacity style={s.numKeyWide}><Text style={s.numKeyTxt}>↑</Text></TouchableOpacity>}
                {ri === 2 && <TouchableOpacity style={s.numKeyWide}><Text style={s.numKeyTxt}>↓</Text></TouchableOpacity>}
                {ri === 3 && <TouchableOpacity style={[s.numKeyWide, { backgroundColor: THEME_COLORS.primary }]}><Text style={[s.numKeyTxt, { color: '#FFF' }]}>→</Text></TouchableOpacity>}
              </View>
            ))}
          </View>
          <View style={s.modalBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowQtyModal(false)}>
              <Text style={s.cancelTxt}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.applyBtn}
              onPress={() => {
                const lenLabel = lengths.length > 0 ? (typeof lengths[selLength] === 'object' ? lengths[selLength].name : lengths[selLength]) : '';
                const fitLabel = fittings.length > 0 ? (typeof fittings[selFitting] === 'object' ? fittings[selFitting].name : fittings[selFitting]) : '';
                const variantLabel = variants.length > 0 ? (typeof variants[selVariant] === 'object' ? variants[selVariant].name : variants[selVariant]) : '';
                const sizeLabel = sizes.length > 0 ? (typeof sizes[selSize] === 'object' ? sizes[selSize].name : sizes[selSize]) : '';
                const colorLabel = (product.colors || product.color || COLOR_LABELS)[selColor]?.name || (product.colors || product.color || COLOR_LABELS)[selColor] || '';
                
                const finalSqFt = sqFt || '1';
                
                let variantStr = '';
                if (variantLabel) variantStr += `Variant: ${variantLabel}, `;
                if (lenLabel) variantStr += `Length: ${lenLabel}, `;
                if (fitLabel) variantStr += `Fitting: ${fitLabel}, `;
                if (customFitting.trim()) variantStr += `Custom Fit: ${customFitting.trim()}, `;
                if (sizeLabel && !lenLabel) variantStr += `Size: ${sizeLabel}, `;
                if (colorLabel) variantStr += `Color: ${colorLabel}, `;
                variantStr += `SqFt: ${finalSqFt}`;
                variantStr = variantStr.replace(/, $/, '');

                addToCart({
                  id: product._id || product.id,
                  name: product.name,
                  price: typeof price === 'number' ? price : (parseFloat(price) || 0),
                  priceSource: 'productDetail',
                  variant: variantStr,
                  image: imgs[activeImg],
                  // installation handled in Checkout screen
                  sqFt: finalSqFt
                }, parseInt(qtyInput) || 1);
                setShowQtyModal(false);
                navigation.navigate('Cart');
              }}
            >
              <Text style={s.applyTxt}>APPLY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  floatBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  fab: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    marginLeft: 8,
  },
  fabRow: { flexDirection: 'row' },

  mainImg: { width, height: height * 0.45, backgroundColor: '#EEE' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#FFF' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: THEME_COLORS.border },
  dotActive: { backgroundColor: THEME_COLORS.primary, width: 18 },

  card: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 8 },

  colorLabel: { fontSize: 13, fontWeight: '600', color: THEME_COLORS.textSecondary, marginBottom: 8 },
  colorVal: { fontWeight: '800', color: THEME_COLORS.text },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  colorCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorCircleActive: { borderColor: THEME_COLORS.primary },

  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  sizeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: THEME_COLORS.background, borderWidth: 1, borderColor: THEME_COLORS.border,
  },
  sizeChipActive: { backgroundColor: '#555', borderColor: '#555' },
  sizeChipTxt: { fontSize: 12, fontWeight: '700', color: THEME_COLORS.text },
  sizeChartLink: { fontSize: 12, color: THEME_COLORS.primary, fontWeight: '700', marginLeft: 4 },

  optionSection: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: THEME_COLORS.border },
  optionsRow: { gap: 10, paddingRight: 10 },
  optionChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  optionChipActive: { backgroundColor: THEME_COLORS.primary, borderColor: THEME_COLORS.primary },
  optionChipTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  
  input: {
    height: 48, borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 16, fontSize: 14, marginTop: 4,
  },

  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  likeTxt: { fontSize: 11, fontWeight: '700', color: THEME_COLORS.textSecondary },

  showAllBtn: { alignItems: 'center', marginVertical: 10 },
  showAllTxt: { fontSize: 13, fontWeight: '800', color: THEME_COLORS.primary },



  catName: { fontSize: 12, color: THEME_COLORS.textSecondary, fontWeight: '600', marginBottom: 2 },
  productName: {
    fontFamily: FONTS.family,
    fontSize: 20,
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginTop: 4,
  },
  priceRatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  priceTxt: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME_COLORS.primary,
    fontFamily: FONTS.family,
  },
  ratingChip: {
    backgroundColor: '#F0FFF4', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  ratingTxt: { fontSize: 13, fontWeight: '800', color: '#22C55E' },

  ctaRow: { flexDirection: 'row', gap: 10, marginBottom: 20, justifyContent: 'space-between', alignItems: 'center' },
  addCartBtn: {
    flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: THEME_COLORS.cartBtn,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  addCartTxt: { color: THEME_COLORS.primary, fontWeight: '900', fontSize: 14 },
  buyNowBtn: {
    width: 175, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME_COLORS.secondary, borderRadius: 12,
    paddingHorizontal: 15, paddingVertical: 10,
    elevation: 4,
    shadowColor: THEME_COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8,
  },
  buyNowTxt: { color: THEME_COLORS.surface, fontWeight: '900', fontSize: 14 },

  inlineQtySelector: {
    flex: 1, height: 48, flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME_COLORS.cartBtn, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1.5, borderColor: THEME_COLORS.primary,
  },
  inlineQtyBtn: {
    width: 44, height: '100%', justifyContent: 'center', alignItems: 'center',
  },
  inlineQtyDisplay: {
    flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FFF',
  },
  inlineQtyTxt: {
    fontSize: 16, fontWeight: '900', color: THEME_COLORS.primary,
  },

  collapseHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: THEME_COLORS.border,
  },
  collapseTitle: { fontSize: 15, fontWeight: '800', color: THEME_COLORS.text },

  highlightBox: { marginBottom: 8 },
  hlHeaderRow: { flexDirection: 'row', paddingVertical: 6, backgroundColor: THEME_COLORS.background, borderRadius: 8 },
  hlHeader: { flex: 1, fontSize: 12, fontWeight: '800', color: THEME_COLORS.textSecondary, textAlign: 'center' },
  hlRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: THEME_COLORS.border },
  hlCell: { flex: 1, fontSize: 13, color: THEME_COLORS.text, textAlign: 'center' },

  reviewCard: {
    backgroundColor: THEME_COLORS.background, borderRadius: 14,
    padding: 14, marginBottom: 10,
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reviewStarBadge: {
    backgroundColor: '#F0FFF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  reviewStarBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#22C55E' },
  reviewTime: { fontSize: 11, color: THEME_COLORS.textSecondary },
  reviewTxt: { fontSize: 13, color: THEME_COLORS.text, marginBottom: 8 },
  reviewActions: { flexDirection: 'row', alignItems: 'center' },
  reviewAvatar: { width: 22, height: 22, borderRadius: 11, marginRight: 6 },
  reviewerName: { flex: 1, fontSize: 12, color: THEME_COLORS.textSecondary, fontWeight: '600' },
  reviewLikes: { flexDirection: 'row', gap: 10 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeTxt: { fontSize: 12, color: THEME_COLORS.textSecondary },

  showAllBtn: {
    borderWidth: 1, borderColor: THEME_COLORS.secondary, borderRadius: 20,
    paddingVertical: 10, alignItems: 'center', marginVertical: 12,
  },
  showAllTxt: { color: THEME_COLORS.secondary, fontWeight: '800', fontSize: 14 },

  similarCard: {
    width: 130, backgroundColor: '#FFF', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: THEME_COLORS.border,
  },
  similarImg: { width: '100%', height: 100, resizeMode: 'cover' },
  similarHeart: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center', alignItems: 'center',
  },
  similarInfo: { padding: 8 },
  similarName: { fontSize: 12, fontWeight: '700', color: THEME_COLORS.text, marginBottom: 4 },
  similarBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  similarPrice: { fontSize: 13, fontWeight: '900', color: THEME_COLORS.text },
  similarAdd: {
    width: 28, height: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  similarAddTxt: { color: '#FFF', fontSize: 14, fontWeight: '900', marginTop: -1 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: THEME_COLORS.text, textAlign: 'center', marginBottom: 16 },
  modalSubtitle: { fontSize: 13, color: THEME_COLORS.textSecondary, marginBottom: 8 },
  qtyDisplay: {
    borderWidth: 1, borderColor: THEME_COLORS.border, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14,
    backgroundColor: THEME_COLORS.background,
  },
  qtyDisplayTxt: { fontSize: 18, fontWeight: '800', color: THEME_COLORS.text },
  numpad: { gap: 8 },
  numRow: { flexDirection: 'row', gap: 8 },
  numKey: {
    flex: 1, height: 44, borderRadius: 10,
    backgroundColor: THEME_COLORS.background, borderWidth: 1, borderColor: THEME_COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  numKeyWide: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: THEME_COLORS.background, borderWidth: 1, borderColor: THEME_COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  numKeyTxt: { fontSize: 16, fontWeight: '700', color: THEME_COLORS.text },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 12,
    borderWidth: 1, borderColor: THEME_COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelTxt: { fontWeight: '800', color: THEME_COLORS.textSecondary, fontSize: 14 },
  applyBtn: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: THEME_COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  applyTxt: { fontWeight: '900', color: '#FFF', fontSize: 14 },

  // Square Feet Calculation Styles
  sqFtCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: THEME_COLORS.border,
  },
  sqFtTitle: {
    fontSize: 16, fontWeight: '800', color: THEME_COLORS.text, marginBottom: 4,
  },
  sqFtSubtitle: {
    fontSize: 12, color: THEME_COLORS.textSecondary, marginBottom: 16, fontWeight: '500',
  },
  sqFtInputRow: {
    flexDirection: 'row', gap: 12, marginBottom: 12,
  },
  sqFtInputGroup: {
    flex: 1,
  },
  sqFtInputLabel: {
    fontSize: 11, fontWeight: '700', color: THEME_COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase',
  },
  sqFtInputWrapper: {
    position: 'relative',
    height: 44,
    justifyContent: 'center',
  },
  sqFtInput: {
    height: 44, borderRadius: 10, borderWidth: 1, borderColor: THEME_COLORS.border,
    paddingHorizontal: 36, fontSize: 16, fontWeight: '600', textAlign: 'center',
  },
  sqFtStepBtnInside: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    width: 30,
  },
  sqFtStepBtnInsideRight: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    width: 30,
  },
  sqFtResult: {
    backgroundColor: '#E0F2FE', borderRadius: 10, padding: 12, alignItems: 'center',
  },
  sqFtResultLabel: {
    fontSize: 12, fontWeight: '600', color: '#0369A1', marginBottom: 4,
  },
  sqFtResultValue: {
    fontSize: 20, fontWeight: '900', color: THEME_COLORS.primary, marginBottom: 4,
  },
  sqFtLimit: {
    fontSize: 11, fontWeight: '600', color: '#0369A1',
  },
});
