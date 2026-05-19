const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
    setup() {
        const selectedCategory = ref('all');
        const selectedSemester = ref('');
        const selectedSubjectId = ref(null);
        const selectedClassId = ref(null);
        const selectedPriority = ref(null);

        const subjects = ref([]);
        const enrollments = ref([]);
        const completedCourses = ref([]);
        const failedCourses = ref([]);

        // Search related
        const searchKeyword = ref('');
        const searchResults = ref([]);
        const searched = ref(false);

        const loadSubjects = async () => {
            try {
                const response = await fetch('data.json');
                const data = await response.json();
                subjects.value = data.subjects;
                completedCourses.value = data.completedCourses || [];
                failedCourses.value = data.failedCourses || [];
            } catch (err) {
                alert(err)
            }
        };

        onMounted(() => loadSubjects());

        const selectedSubject = computed(() => {
            if (!selectedSubjectId.value) return null;
            return subjects.value.find(s => s.id === selectedSubjectId.value);
        });

        const selectedClass = computed(() => {
            if (!selectedClassId.value || !selectedSubject.value) return null;
            return selectedSubject.value.classes.find(c => c.id === selectedClassId.value);
        });

        const completedCourseIds = computed(() => {
            return completedCourses.value.map(c => c.subjectId);
        });

        const isCourseCompleted = (subjectId) => {
            return completedCourseIds.value.includes(subjectId);
        };

        const hasPrereqs = (subject) => {
            if (!subject?.prerequisites?.length) return true;
            return subject.prerequisites.every(id => completedCourseIds.value.includes(id));
        };

        const prereqStatus = (subject) => {
            if (!subject?.prerequisites?.length) {
                return { met: true, text: 'None', missing: [], unmetNames: [] };
            }

            const missing = subject.prerequisites.filter(id => !completedCourseIds.value.includes(id));
            const names = subject.prerequisites.map(id => {
                const s = subjects.value.find(s => s.id === id);
                return s?.code || id;
            });

            return {
                met: missing.length === 0,
                text: names.join(', '),
                missing: missing,
                unmetNames: missing.map(id => {
                    const s = subjects.value.find(s => s.id === id);
                    return s ? `${s.code} - ${s.name}` : id;
                })
            };
        };

        const categoryFiltered = computed(() => {
            if (selectedCategory.value === 'all') return subjects.value;
            return subjects.value.filter(s => s.category === selectedCategory.value);
        });

        const uniqueSemesters = computed(() => {
            const semesters = new Set(categoryFiltered.value.map(s => s.semester));
            return Array.from(semesters).sort((a, b) => a - b);
        });

        const filteredSubjects = computed(() => {
            if (!selectedSemester.value) return [];
            let filtered = categoryFiltered.value;
            filtered = filtered.filter(s => s.semester === selectedSemester.value);
            // Also filter out completed courses from the dropdown
            filtered = filtered.filter(s => !isCourseCompleted(s.id));
            return filtered;
        });

        const prereqForSelected = computed(() => prereqStatus(selectedSubject.value));

        const isSelectedCourseCompleted = computed(() => {
            if (!selectedSubject.value) return false;
            return isCourseCompleted(selectedSubject.value.id);
        });

        const showClassSelection = computed(() => {
            return selectedSubject.value &&
                   !isSelectedCourseCompleted.value &&
                   prereqForSelected.value.met &&
                   selectedSubject.value.classes &&
                   selectedSubject.value.classes.length > 0;
        });

        const totalCredits = computed(() => {
            const uniqueSubjectIds = new Set();
            enrollments.value.forEach(item => {
                uniqueSubjectIds.add(item.subjectId);
            });

            // Sum credits for unique subjects
            let total = 0;
            uniqueSubjectIds.forEach(subjectId => {
                const subject = subjects.value.find(s => s.id === subjectId);
                if (subject) {
                    total += subject.credits;
                }
            });
            return total;
        });

        const enrolledClassIdsForSelectedSubject = computed(() => {
            if (!selectedSubject.value) return [];
            return enrollments.value
                .filter(e => e.subjectId === selectedSubject.value.id)
                .map(e => e.classId);
        });

        const usedPrioritiesForSelectedSubject = computed(() => {
            if (!selectedSubject.value) return [];
            return enrollments.value
                .filter(e => e.subjectId === selectedSubject.value.id)
                .map(e => parseInt(e.priority));
        });

        const isClassEnrolled = (classId) => {
            return enrolledClassIdsForSelectedSubject.value.includes(classId);
        };

        const isPriorityUsed = (priority) => {
            const priorityNum = parseInt(priority);
            return usedPrioritiesForSelectedSubject.value.includes(priorityNum);
        };

        const getAvailablePriorities = () => {
            const allPriorities = [1, 2, 3];
            const used = usedPrioritiesForSelectedSubject.value;
            return allPriorities.filter(p => !used.includes(p));
        };

        watch(selectedClassId, () => {
            selectedPriority.value = null;
        });

        const addToEnrollment = () => {
            if (!selectedSemester.value) return alert('Please select a semester');
            if (!selectedSubjectId.value) return alert('Please select a subject');
            if (!selectedClassId.value) return alert('Please select a class');
            if (!selectedPriority.value) return alert('Please select a priority');

            const subject = selectedSubject.value;
            const classItem = selectedClass.value;
            const priorityNum = parseInt(selectedPriority.value);

            if (isCourseCompleted(subject.id)) {
                alert(`❌ Cannot enroll in ${subject.code} - ${subject.name}\n\nThis course has already been completed with grade: ${completedCourses.value.find(c => c.subjectId === subject.id)?.grade}\n\nYou cannot retake a completed course.`);
                return;
            }

            if (!hasPrereqs(subject)) {
                const status = prereqStatus(subject);
                alert(`Cannot enroll in ${subject.code} - ${subject.name}\n\nMissing prerequisites:\n${status.unmetNames.join('\n')}`);
                return;
            }

            if (isClassEnrolled(classItem.id)) {
                alert(`❌ ${subject.code} - ${subject.name} (${classItem.name}) is already in your enrollment.\n\nYou can only enroll in different class schedules for the same subject.`);
                return;
            }

            if (isPriorityUsed(priorityNum)) {
                const available = getAvailablePriorities();
                alert(`❌ Priority ${priorityNum} is already used for another class of ${subject.code}.\n\nAvailable priorities: ${available.join(', ')}`);
                return;
            }

            const newEnrollment = {
                id: Date.now(),
                subjectId: subject.id,
                classId: classItem.id,
                code: subject.code,
                name: subject.name,
                semester: selectedSemester.value,
                credits: subject.credits,
                policy: subject.policy,
                className: classItem.name,
                schedules: classItem.schedules,
                priority: priorityNum
            };

            const overlap = checkScheduleOverlap(newEnrollment);
            if (overlap.overlap) {
                alert(`❌ Schedule Conflict!\n\n${subject.code} - ${subject.name} (${classItem.name})\nconflicts with:\n${overlap.with.code} - ${overlap.with.name} (${overlap.with.className})\n\nConflict: ${overlap.schedule.day} ${overlap.schedule.time}\n\nPlease choose a different class or remove the conflicting enrollment.`);
                return;
            }

            enrollments.value.push(newEnrollment);

            selectedSubjectId.value = null;
            selectedClassId.value = null;
            selectedPriority.value = null;

            alert(`Added: ${subject.code} - ${subject.name} (${classItem.name}) - Priority ${priorityNum}`);
        };

        const removeEnrollment = (id) => {
            const item = enrollments.value.find(e => e.id === id);
            if (item && confirm(`Remove ${item.code} - ${item.name} (${item.className})?`)) {
                enrollments.value = enrollments.value.filter(e => e.id !== id);
            }
        };

        const clearEnrollments = () => {
            if (enrollments.value.length && confirm('Clear all items?')) {
                enrollments.value = [];
                resetForm();
            }
        };

        const validateEnrollments = () => {
            if (!enrollments.value.length) return alert('No items to validate');

            const grouped = {};
            enrollments.value.forEach(item => {
                if (!grouped[item.code]) grouped[item.code] = [];
                grouped[item.code].push(item);
            });

            let msg = `✅ Validation\n\nTotal Items: ${enrollments.value.length}\nTotal Credits: ${totalCredits.value}\n\n`;

            for (const [code, items] of Object.entries(grouped)) {
                msg += `\n📚 ${code}:\n`;
                items.forEach((item, idx) => {
                    msg += `   ${idx + 1}. ${item.className} | Priority ${item.priority} | Sem ${item.semester}\n`;
                });
            }

            alert(msg);
        };

        const performSearch = () => {
            if (!searchKeyword.value.trim()) {
                alert('Please enter a keyword to search');
                return;
            }

            const keyword = searchKeyword.value.toLowerCase().trim();
            searchResults.value = subjects.value.filter(subject => {
                // Don't show already completed courses in search results? Or show but disable?
                // Let's show them but with a badge indicating they're completed
                return subject.code.toLowerCase().includes(keyword) ||
                       subject.name.toLowerCase().includes(keyword) ||
                       (subject.tags && subject.tags.some(tag => tag.toLowerCase().includes(keyword)));
            });
            searched.value = true;
        };

        const clearSearch = () => {
            searchKeyword.value = '';
            searchResults.value = [];
            searched.value = false;
        };

        const takeSubject = (subjectId) => {
            const subject = subjects.value.find(s => s.id === subjectId);
            if (!subject) {
                alert('Subject not found');
                return;
            }

            // Check if course is already completed
            if (isCourseCompleted(subject.id)) {
                const completedCourse = completedCourses.value.find(c => c.subjectId === subject.id);
                alert(`❌ Cannot select ${subject.code} - ${subject.name}\n\nThis course has already been completed with grade: ${completedCourse?.grade}\n\nYou cannot retake a completed course.`);
                return;
            }

            const modal = document.getElementById('searchModal');
            const bootstrapModal = bootstrap.Modal.getInstance(modal);
            if (bootstrapModal) {
                bootstrapModal.hide();
            }

            selectedCategory.value = 'all';
            selectedSemester.value = subject.semester;
            selectedSubjectId.value = subject.id;
            selectedClassId.value = null;
            selectedPriority.value = null;

            clearSearch();

            // Show message if prerequisites not met
            if (!hasPrereqs(subject)) {
                const status = prereqStatus(subject);
                alert(`⚠️ Prerequisite Warning\n\n${subject.code} - ${subject.name}\n\nMissing prerequisites:\n${status.unmetNames.join('\n')}\n\nYou cannot enroll until you complete these courses.`);
            }
        };

        const checkScheduleOverlap = (newEnrollment) => {
            // Check against existing enrollments
            for (const existing of enrollments.value) {
                // Only check if same semester
                if (existing.semester === newEnrollment.semester) {
                    // Check if any schedule overlaps
                    for (const newSchedule of newEnrollment.schedules) {
                        for (const existingSchedule of existing.schedules) {
                            const newDay = newSchedule.day;
                            const existingDay = existingSchedule.day;
                            const newTime = newSchedule.time;
                            const existingTime = existingSchedule.time;

                            if (newDay === existingDay && isTimeOverlap(newTime, existingTime)) {
                                return {
                                    overlap: true,
                                    with: existing,
                                    schedule: existingSchedule
                                };
                            }
                        }
                    }
                }
            }
            return { overlap: false };
        };

        const isTimeOverlap = (time1, time2) => {
            const parseTime = (time) => {
                const [start, end] = time.split(' - ');
                const startHour = parseInt(start.split(':')[0]);
                const startMin = parseInt(start.split(':')[1] || 0);
                const endHour = parseInt(end.split(':')[0]);
                const endMin = parseInt(end.split(':')[1] || 0);
                return { start: startHour + startMin/60, end: endHour + endMin/60 };
            };

            const t1 = parseTime(time1);
            const t2 = parseTime(time2);

            return (t1.start < t2.end && t1.end > t2.start);
        };

        const currentScheduleConflict = computed(() => {
            if (!selectedClass.value || !selectedSubject.value || !selectedSemester.value) return null;

            const newEnrollment = {
                subjectId: selectedSubject.value.id,
                classId: selectedClass.value.id,
                code: selectedSubject.value.code,
                name: selectedSubject.value.name,
                semester: selectedSemester.value,
                className: selectedClass.value.name,
                schedules: selectedClass.value.schedules
            };

            return checkScheduleOverlap(newEnrollment);
        });

        const resetForm = () => {
            selectedSemester.value = '';
            selectedSubjectId.value = null;
            selectedClassId.value = null;
            selectedPriority.value = null;
        };

        const onCategoryChange = (category) => {
            selectedCategory.value = category;
            resetForm();
        };

        const onSemesterChange = () => {
            selectedSubjectId.value = null;
            selectedClassId.value = null;
            selectedPriority.value = null;
        };

        const onSubjectChange = () => {
            selectedClassId.value = null;
            selectedPriority.value = null;
        };

        return {
            subjects,
            completedCourses,
            failedCourses,
            selectedCategory,
            selectedSemester,
            selectedSubjectId,
            selectedClassId,
            selectedPriority,
            selectedSubject,
            selectedClass,
            enrollments,
            totalCredits,
            uniqueSemesters,
            filteredSubjects,
            prereqForSelected,
            isClassEnrolled,
            isPriorityUsed,
            getAvailablePriorities,
            usedPrioritiesForSelectedSubject,
            showClassSelection,
            isSelectedCourseCompleted,
            isCourseCompleted,
            currentScheduleConflict,
            onCategoryChange,
            onSubjectChange,
            onSemesterChange,
            addToEnrollment,
            removeEnrollment,
            clearEnrollments,
            validateEnrollments,
            searchKeyword,
            searchResults,
            searched,
            performSearch,
            clearSearch,
            takeSubject
        };
    }
}).mount('#app');
