document.addEventListener("layout:ready", function () {
  const heroCarousel = document.getElementById("heroCarousel");
  if (!heroCarousel || !window.bootstrap) {
    return;
  }

  heroCarousel.addEventListener("click", function () {
    const carousel = new window.bootstrap.Carousel(heroCarousel);
    carousel.next();
  });

  new window.bootstrap.Carousel(heroCarousel);
  heroCarousel.addEventListener("slid.bs.carousel", function () {
    const captions = document.querySelectorAll(".sponsor-caption");
    captions.forEach((caption) => {
      caption.style.opacity = "0";
    });

    const activeCaption = heroCarousel.querySelector(".active .sponsor-caption");
    if (activeCaption) {
      activeCaption.style.opacity = "1";
    }
  });
});
