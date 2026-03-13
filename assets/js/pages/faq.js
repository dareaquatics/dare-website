document.addEventListener("layout:ready", function () {
  const faqQuestions = document.querySelectorAll(".faq-question");
  const faqSearch = document.getElementById("faq-search");
  const faqContent = document.getElementById("faq-content");
  const noResults = document.getElementById("no-results");

  if (!faqQuestions.length || !faqSearch || !faqContent || !noResults) {
    return;
  }

  faqQuestions.forEach((question) => {
    question.addEventListener("click", function () {
      const answer = question.nextElementSibling;
      const icon = question.querySelector("i");
      if (!answer || !icon) {
        return;
      }

      faqQuestions.forEach((otherQuestion) => {
        if (otherQuestion === question) {
          return;
        }

        const otherAnswer = otherQuestion.nextElementSibling;
        const otherIcon = otherQuestion.querySelector("i");
        if (!otherAnswer || !otherIcon) {
          return;
        }

        otherAnswer.classList.remove("show");
        otherIcon.classList.remove("bi-caret-down-fill");
        otherIcon.classList.add("bi-caret-right-fill");
      });

      answer.classList.toggle("show");
      if (answer.classList.contains("show")) {
        icon.classList.remove("bi-caret-right-fill");
        icon.classList.add("bi-caret-down-fill");
      } else {
        icon.classList.remove("bi-caret-down-fill");
        icon.classList.add("bi-caret-right-fill");
      }
    });
  });

  faqSearch.addEventListener("input", function () {
    const searchTerm = faqSearch.value.toLowerCase().trim();
    let matchFound = false;

    faqQuestions.forEach((question) => {
      const faqItem = question.closest(".faq-item");
      const faqSection = question.closest(".faq-section");
      const questionText = question.textContent.toLowerCase();
      const answerText = (question.nextElementSibling?.textContent || "").toLowerCase();

      if (questionText.includes(searchTerm) || answerText.includes(searchTerm)) {
        faqItem.style.display = "block";
        faqSection.style.display = "block";
        matchFound = true;
      } else {
        faqItem.style.display = "none";
      }
    });

    document.querySelectorAll(".faq-section").forEach((section) => {
      const visibleItems = section.querySelectorAll('.faq-item[style="display: block;"]');
      section.style.display = visibleItems.length > 0 ? "block" : "none";
    });

    if (matchFound) {
      faqContent.style.display = "block";
      noResults.style.display = "none";
    } else {
      faqContent.style.display = "none";
      noResults.style.display = "block";
    }
  });
});
